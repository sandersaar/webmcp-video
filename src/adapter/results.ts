import type { FixtureMoment, FixtureVideo, PlayerResult } from "./types";
import type { ToolId } from "./types";
import { isOpaqueMomentReference } from "./reference-vault";

const blockedFieldParts = ["constructor", "fixturekey", "manifest", "provider", "proto", "signature", "storage", "stream", "token", "videoid"];
const allowedUrlField = "open_url";

function invalidResult(): never {
  throw new Error("invalid_tool_result");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function copyJson(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : invalidResult();
  if (!value || typeof value !== "object" || ancestors.has(value)) invalidResult();
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) invalidResult();
      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.some((key) => typeof key !== "string" ||
          (key !== "length" && !/^(?:0|[1-9]\d*)$/.test(key)))) invalidResult();
      const copied = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalidResult();
        copied.push(copyJson(descriptor.value, ancestors));
      }
      return copied;
    }
    if (!isPlainObject(value)) invalidResult();
    const copied = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") invalidResult();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalidResult();
      copied[key] = copyJson(descriptor.value, ancestors);
    }
    return copied;
  } finally {
    ancestors.delete(value);
  }
}

function validateOpenUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("unsafe_result_url");
  }
  if (parsed.protocol !== "https:" || parsed.origin !== "https://www.youtube.com" || parsed.pathname !== "/watch" ||
      parsed.username || parsed.password || parsed.hash) {
    throw new Error("unsafe_result_url");
  }
  const keys = [...parsed.searchParams.keys()];
  if (keys.length !== 2 || keys[0] !== "v" || keys[1] !== "t" ||
      parsed.searchParams.getAll("v").length !== 1 || parsed.searchParams.getAll("t").length !== 1 ||
      !/^[A-Za-z0-9_-]{11}$/.test(parsed.searchParams.get("v") ?? "") ||
      !/^\d+(?:\.\d+)?s$/.test(parsed.searchParams.get("t") ?? "")) {
    throw new Error("unsafe_result_url");
  }
}

export function assertSafeResult(value: unknown, property = "", seen = new Set<unknown>()): void {
  if (typeof value === "string") {
    const compact = value.replace(/[\t\n\r]/g, "");
    const containsUrl = (candidate: string) => /(?:https?:)?\/\/[^\s"'<>]+/i.test(candidate);
    if (property === allowedUrlField) validateOpenUrl(value);
    else if (containsUrl(value) || containsUrl(compact)) throw new Error("unexpected_result_url");
    return;
  }
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const nested of value) assertSafeResult(nested, property, seen);
    return;
  }
  if (!isPlainObject(value)) invalidResult();
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (blockedFieldParts.some((part) => normalized.includes(part))) throw new Error("unsafe_result_field");
    assertSafeResult(nested, key, seen);
  }
}

export function safeResult<T>(value: T, maximumCharacters: number): T {
  const copied = copyJson(value) as T;
  assertSafeResult(copied);
  if (JSON.stringify(copied).length > maximumCharacters) throw new Error("tool_result_too_large");
  return copied;
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isPlainObject(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    invalidResult();
  }
  return value;
}

function requiredString(object: Record<string, unknown>, key: string, maximum = 1000): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) invalidResult();
  return value;
}

function requiredNumber(object: Record<string, unknown>, key: string): number {
  const value = object[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) invalidResult();
  return value;
}

function validateExpiry(value: string): void {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) invalidResult();
}

function validateMoment(value: unknown, context: boolean): void {
  const keys = ["end_seconds", "evidence", "expires_at", "moment_ref", "open_url", "start_seconds", "title"];
  if (context) keys.push("visual_description");
  const object = exactObject(value, keys);
  const start = requiredNumber(object, "start_seconds");
  const end = requiredNumber(object, "end_seconds");
  if (end <= start) invalidResult();
  requiredString(object, "title", 300);
  requiredString(object, "evidence", 2000);
  if (context) requiredString(object, "visual_description", 2000);
  const momentRef = requiredString(object, "moment_ref", 26);
  if (!isOpaqueMomentReference(momentRef)) invalidResult();
  validateExpiry(requiredString(object, "expires_at", 30));
  const openUrl = requiredString(object, "open_url", 300);
  validateOpenUrl(openUrl);
  const linkedSecond = Number(new URL(openUrl).searchParams.get("t")?.replace(/s$/, ""));
  if (linkedSecond !== start) invalidResult();
}

export function validateToolResult(toolId: ToolId, result: unknown, maximumCharacters: number): unknown {
  const canonical = safeResult(result, maximumCharacters);
  if (toolId === "search_this_catalog") {
    const object = exactObject(canonical, ["moments"]);
    if (!Array.isArray(object.moments) || object.moments.length > 5) invalidResult();
    object.moments.forEach((moment) => validateMoment(moment, false));
    return canonical;
  }
  if (toolId === "get_moment_context") {
    validateMoment(canonical, true);
    return canonical;
  }
  const object = exactObject(canonical, [
    "expires_at",
    "moment_ref",
    "observed_seconds",
    "open_url",
    "player_state",
    "requested_seconds",
    "status",
  ]);
  const status = requiredString(object, "status") as PlayerResult["status"];
  const playerState = requiredString(object, "player_state") as PlayerResult["player_state"];
  const requestedSeconds = requiredNumber(object, "requested_seconds");
  const observed = object.observed_seconds;
  if (observed !== null && (typeof observed !== "number" || !Number.isFinite(observed) || observed < 0)) invalidResult();
  assertTruthfulPlayerResult({ status, player_state: playerState, observed_seconds: observed as number | null }, requestedSeconds);
  const momentRef = requiredString(object, "moment_ref", 26);
  if (!isOpaqueMomentReference(momentRef)) invalidResult();
  validateExpiry(requiredString(object, "expires_at", 30));
  const openUrl = requiredString(object, "open_url", 300);
  validateOpenUrl(openUrl);
  const linkedSecond = Number(new URL(openUrl).searchParams.get("t")?.replace(/s$/, ""));
  if (linkedSecond !== requestedSeconds) invalidResult();
  return canonical;
}

export function officialMomentUrl(youtubeVideoId: string, startSeconds: number): string {
  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", youtubeVideoId);
  url.searchParams.set("t", `${startSeconds}s`);
  return url.toString();
}

export function momentResult(input: Readonly<{
  video: FixtureVideo;
  moment: FixtureMoment;
  momentRef: string;
  expiresAt: string;
}>) {
  if (input.moment.start_seconds >= input.moment.end_seconds) invalidResult();
  return {
    title: input.video.title,
    start_seconds: input.moment.start_seconds,
    end_seconds: input.moment.end_seconds,
    evidence: input.moment.evidence,
    moment_ref: input.momentRef,
    expires_at: input.expiresAt,
    open_url: officialMomentUrl(input.video.youtube_video_id, input.moment.start_seconds),
  };
}

export function assertTruthfulPlayerResult(result: PlayerResult, requestedSeconds: number): void {
  const allowedStates: Record<PlayerResult["status"], readonly PlayerResult["player_state"][]> = {
    sought: ["playing", "paused", "buffering"],
    cued: ["cued"],
    needs_user: ["paused", "cued"],
    fallback: ["unavailable", "unknown"],
  };
  if (!allowedStates[result.status].includes(result.player_state)) invalidResult();
  if (result.status === "sought" &&
      (result.observed_seconds === null || Math.abs(result.observed_seconds - requestedSeconds) > 1)) invalidResult();
  if ((result.status === "cued" || result.status === "fallback") && result.observed_seconds !== null) invalidResult();
}
