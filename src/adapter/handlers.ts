import { assertTruthfulPlayerResult, momentResult, safeResult } from "./results";
import { isSupersededPlayError, SupersededPlayError } from "./player";
import type { AuditEntry, FixtureCatalog, OfficialPlayer, PageConfig, PlayerResult, ToolHandlers, ToolId } from "./types";
import { FixtureRightsStore, RightsDeniedError } from "#video/fixture/rights-store";

type AuditSink = (entry: AuditEntry) => void;

function auditBase(toolId: ToolId, pageMapping: string): AuditEntry {
  return {
    tool_id: toolId,
    invocation_id: crypto.randomUUID(),
    page_mapping: pageMapping,
    moment_ref: null,
    rights_decision: "not_applicable",
    requested_second: null,
    observed_second: null,
    player_status: null,
    safe_error_code: null,
  };
}

function parseObject(value: unknown, allowedKeys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).some((key) => !allowedKeys.includes(key))) throw new Error("invalid_input");
  return value as Record<string, unknown>;
}

function parseText(value: unknown, key: string, minimum: number, maximum: number, allowedKeys: readonly string[]): string {
  const object = parseObject(value, allowedKeys);
  const text = object[key];
  if (typeof text !== "string" || text.length < minimum || text.length > maximum) throw new Error("invalid_input");
  return text;
}

function linkedSignal(signals: readonly AbortSignal[]): Readonly<{ signal: AbortSignal; dispose(): void }> {
  const controller = new AbortController();
  const abort = () => controller.abort("operation_aborted");
  for (const signal of signals) {
    if (signal.aborted) controller.abort("operation_aborted");
    else signal.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose: () => signals.forEach((signal) => signal.removeEventListener("abort", abort)),
  };
}

export function createFixtureHandlers(input: Readonly<{
  config: PageConfig;
  fixture: FixtureCatalog;
  player: OfficialPlayer;
  rightsStore: FixtureRightsStore;
  audit: AuditSink;
  beforePlayerAction?: () => Promise<void>;
}>): ToolHandlers {
  if (input.config.page_mapping !== input.fixture.page_mapping) throw new Error("page_mapping_mismatch");
  const beforePlayerAction = input.beforePlayerAction ?? (async () => undefined);
  let activePlay: AbortController | undefined;
  let playGeneration = 0;

  return {
    async search_this_catalog(rawInput) {
      const object = parseObject(rawInput, ["query", "limit"]);
      const query = parseText(rawInput, "query", 2, 300, ["query", "limit"])
        .toLowerCase().replace(/\s+/g, " ").trim();
      const limit = object.limit ?? 3;
      if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 5) throw new Error("invalid_input");
      const terms = query.split(" ").filter((term) => term.length > 1);
      const moments = input.rightsStore.activeEntries()
        .map((entry, index) => {
          const haystack = `${entry.video.title} ${entry.moment.evidence} ${entry.moment.visual_description}`.toLowerCase();
          return { entry, index, matches: terms.every((term) => haystack.includes(term)) };
        })
        .filter((candidate) => candidate.matches)
        .sort((left, right) => left.index - right.index)
        .slice(0, Number(limit))
        .map(({ entry }) => {
          const issued = input.rightsStore.issue(entry);
          return momentResult({ video: entry.video, moment: entry.moment, ...issued });
        });
      input.audit({ ...auditBase("search_this_catalog", input.config.page_mapping), rights_decision: "filtered" });
      return safeResult({ moments }, 1500);
    },

    async get_moment_context(rawInput) {
      const momentRef = parseText(rawInput, "moment_ref", 26, 26, ["moment_ref"]);
      const entry = auditBase("get_moment_context", input.config.page_mapping);
      try {
        const authorized = input.rightsStore.authorize(momentRef);
        input.audit({ ...entry, moment_ref: momentRef, rights_decision: "allowed" });
        return safeResult({
          ...momentResult({
            video: authorized.video,
            moment: authorized.moment,
            momentRef,
            expiresAt: authorized.authorization.expires_at,
          }),
          visual_description: authorized.moment.visual_description,
        }, 1500);
      } catch (error) {
        input.audit({ ...entry, moment_ref: momentRef, rights_decision: "denied", safe_error_code: "rights_denied" });
        throw error;
      }
    },

    async play_moment(rawInput, context) {
      const momentRef = parseText(rawInput, "moment_ref", 26, 26, ["moment_ref"]);
      const entry = auditBase("play_moment", input.config.page_mapping);
      let dispose: () => void = () => undefined;
      let operation: AbortController | undefined;
      let generation = 0;
      let audited = false;
      let authorized: ReturnType<FixtureRightsStore["authorize"]> | undefined;
      const assertLatest = () => {
        if (!operation || generation !== playGeneration || operation.signal.aborted) {
          throw new SupersededPlayError("play_superseded");
        }
      };
      const record = (auditEntry: AuditEntry) => {
        if (!audited) {
          audited = true;
          input.audit(auditEntry);
        }
      };
      try {
        authorized = input.rightsStore.authorize(momentRef);
        operation = new AbortController();
        activePlay?.abort("superseded");
        activePlay = operation;
        generation = ++playGeneration;
        const linked = linkedSignal([authorized.revocationSignal, context.signal, operation.signal]);
        dispose = linked.dispose;
        assertLatest();
        await beforePlayerAction();
        assertLatest();
        input.rightsStore.assertAuthorizationActive(momentRef, authorized.rightsGeneration);
        assertLatest();
        let observed: PlayerResult;
        try {
          observed = await input.player.playMoment(authorized.authorization, linked.signal);
        } catch (error) {
          assertLatest();
          input.rightsStore.assertAuthorizationActive(momentRef, authorized.rightsGeneration);
          throw error;
        }
        assertLatest();
        input.rightsStore.assertAuthorizationActive(momentRef, authorized.rightsGeneration);
        assertTruthfulPlayerResult(observed, authorized.authorization.requested_seconds);
        assertLatest();
        record({
          ...entry,
          moment_ref: momentRef,
          rights_decision: "allowed",
          requested_second: authorized.authorization.requested_seconds,
          observed_second: observed.observed_seconds,
          player_status: observed.status,
        });
        return safeResult({
          status: observed.status,
          requested_seconds: authorized.authorization.requested_seconds,
          observed_seconds: observed.observed_seconds,
          player_state: observed.player_state,
          moment_ref: momentRef,
          expires_at: authorized.authorization.expires_at,
          open_url: authorized.authorization.open_url,
        }, 1200);
      } catch (error) {
        if (authorized) {
          try {
            input.rightsStore.assertAuthorizationActive(momentRef, authorized.rightsGeneration);
          } catch (rightsError) {
            record({ ...entry, moment_ref: momentRef, rights_decision: "denied", safe_error_code: "rights_denied" });
            throw rightsError;
          }
        }
        if (isSupersededPlayError(error) || (operation !== undefined &&
            (generation !== playGeneration || operation.signal.aborted))) {
          if (authorized) {
            record({
              ...entry,
              moment_ref: momentRef,
              rights_decision: "allowed",
              requested_second: authorized.authorization.requested_seconds,
              safe_error_code: "play_superseded",
            });
          }
          throw isSupersededPlayError(error) ? error : new SupersededPlayError("play_superseded");
        }
        const denied = error instanceof RightsDeniedError;
        record({
          ...entry,
          moment_ref: momentRef,
          rights_decision: denied ? "denied" : "not_applicable",
          safe_error_code: denied ? "rights_denied" : "player_failed",
        });
        throw error;
      } finally {
        dispose();
        if (operation && activePlay === operation) activePlay = undefined;
      }
    },
  };
}
