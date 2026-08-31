import { describe, expect, it, vi } from "vitest";
import fixtureJson from "../public/fixtures/rights-safe-catalog.v1.json";
import { createFixtureHandlers } from "#video/adapter/handlers";
import { SupersededPlayError } from "#video/adapter/player";
import { ReferenceVault } from "#video/adapter/reference-vault";
import type { FixtureCatalog, OfficialPlayer, PageConfig } from "#video/adapter/types";
import { parseFixture } from "#video/fixture/load-fixture";
import { FixtureRightsStore } from "#video/fixture/rights-store";

const config: PageConfig = {
  contract_version: "1.0",
  page_mapping: "page_public_demo_v1",
  enabled_tools: ["search_this_catalog", "get_moment_context", "play_moment"],
  kill_switch: false,
  fixture_path: "/fixtures/rights-safe-catalog.v1.json",
};

describe("three-tool flow", () => {
  it("chains search to context and playback without raw locator fields", async () => {
    const fixture = parseFixture(fixtureJson) as FixtureCatalog;
    const vault = new ReferenceVault(config.page_mapping);
    const rightsStore = new FixtureRightsStore(fixture, vault, config.page_mapping);
    const player: OfficialPlayer = {
      playMoment: vi.fn(async () => ({
        status: "sought",
        observed_seconds: 46,
        player_state: "paused",
      } as const)),
    };
    const audit = vi.fn();
    const handlers = createFixtureHandlers({ config, fixture, rightsStore, player, audit });

    const search = await handlers.search_this_catalog({ query: "motorized exoskeleton", limit: 1 }, {
      signal: new AbortController().signal,
    }) as { moments: Array<{ moment_ref: string; start_seconds: number }> };
    expect(search.moments).toHaveLength(1);
    expect(search.moments[0]?.start_seconds).toBe(46);

    const momentRef = search.moments[0]?.moment_ref ?? "";
    const context = await handlers.get_moment_context({ moment_ref: momentRef }, {
      signal: new AbortController().signal,
    });
    expect(context).toMatchObject({ moment_ref: momentRef, start_seconds: 46 });

    const play = await handlers.play_moment({ moment_ref: momentRef }, {
      signal: new AbortController().signal,
    });
    expect(play).toMatchObject({ moment_ref: momentRef, status: "sought", requested_seconds: 46 });
    expect(JSON.stringify({ search, context, play })).not.toMatch(/(?:fixture_key|youtube_video_id|video_id|stream|manifest)/i);
    expect(player.playMoment).toHaveBeenCalledOnce();
    expect(audit).toHaveBeenCalledTimes(3);
  });

  it("keeps maximum search output and every context output inside the 1500-character budget", async () => {
    const fixture = parseFixture(fixtureJson) as FixtureCatalog;
    const vault = new ReferenceVault(config.page_mapping);
    const rightsStore = new FixtureRightsStore(fixture, vault, config.page_mapping);
    const handlers = createFixtureHandlers({
      config,
      fixture,
      rightsStore,
      player: { playMoment: vi.fn() },
      audit: vi.fn(),
    });
    const context = { signal: new AbortController().signal };
    const search = await handlers.search_this_catalog({ query: "China", limit: 5 }, context) as {
      moments: Array<{ moment_ref: string }>;
    };
    expect(search.moments).toHaveLength(3);
    expect(JSON.stringify(search).length).toBeLessThanOrEqual(1500);
    for (const moment of search.moments) {
      const result = await handlers.get_moment_context({ moment_ref: moment.moment_ref }, context);
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(1500);
    }
  });

  it("records one superseded authorized audit and gives revocation precedence", async () => {
    const fixture = parseFixture(fixtureJson) as FixtureCatalog;
    const vault = new ReferenceVault(config.page_mapping);
    const rightsStore = new FixtureRightsStore(fixture, vault, config.page_mapping);
    const audit = vi.fn();
    let releaseFirst: (() => void) | undefined;
    let calls = 0;
    const player: OfficialPlayer = {
      playMoment: vi.fn(async (_authorization, signal) => {
        calls += 1;
        if (calls % 2 === 1) {
          await new Promise<void>((resolve) => { releaseFirst = resolve; });
          if (signal.aborted) throw new SupersededPlayError("play_superseded");
        }
        return { status: "sought", observed_seconds: 52, player_state: "paused" } as const;
      }),
    };
    const handlers = createFixtureHandlers({ config, fixture, rightsStore, player, audit });
    const context = { signal: new AbortController().signal };
    const search = await handlers.search_this_catalog({ query: "motorized exoskeleton", limit: 1 }, context) as {
      moments: Array<{ moment_ref: string }>;
    };
    const firstRef = search.moments[0]?.moment_ref ?? "";
    const secondEntry = rightsStore.activeEntries().find((entry) => entry.moment.start_seconds === 52);
    const secondRef = secondEntry ? rightsStore.issue(secondEntry).momentRef : "";
    const first = handlers.play_moment({ moment_ref: firstRef }, context);
    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
    const second = handlers.play_moment({ moment_ref: secondRef }, context);
    releaseFirst?.();
    await expect(first).rejects.toBeInstanceOf(SupersededPlayError);
    await expect(second).resolves.toMatchObject({ status: "sought", requested_seconds: 52 });
    const cancellation = audit.mock.calls.map(([entry]) => entry).filter((entry) => entry.safe_error_code === "play_superseded");
    expect(cancellation).toEqual([expect.objectContaining({
      moment_ref: firstRef,
      rights_decision: "allowed",
      requested_second: 46,
      observed_second: null,
      player_status: null,
      safe_error_code: "play_superseded",
    })]);

    const third = handlers.play_moment({ moment_ref: firstRef }, context);
    await vi.waitFor(() => expect(calls).toBe(3));
    const fourth = handlers.play_moment({ moment_ref: secondRef }, context);
    rightsStore.revokeReference(firstRef);
    releaseFirst?.();
    await expect(third).rejects.toThrow("rights_denied");
    await expect(fourth).resolves.toMatchObject({ status: "sought", requested_seconds: 52 });
    const thirdAudits = audit.mock.calls.map(([entry]) => entry).filter((entry) => entry.moment_ref === firstRef);
    expect(thirdAudits.at(-1)).toMatchObject({ rights_decision: "denied", safe_error_code: "rights_denied" });
  });

  it("does not cancel an authorized play when the newer moment_ref is denied", async () => {
    const fixture = parseFixture(fixtureJson) as FixtureCatalog;
    const vault = new ReferenceVault(config.page_mapping);
    const rightsStore = new FixtureRightsStore(fixture, vault, config.page_mapping);
    const audit = vi.fn();
    let release: (() => void) | undefined;
    const player: OfficialPlayer = {
      playMoment: vi.fn(async (authorization) => {
        await new Promise<void>((resolve) => { release = resolve; });
        return {
          status: "sought",
          observed_seconds: authorization.requested_seconds,
          player_state: "paused",
        } as const;
      }),
    };
    const handlers = createFixtureHandlers({ config, fixture, rightsStore, player, audit });
    const context = { signal: new AbortController().signal };
    const search = await handlers.search_this_catalog({ query: "motorized exoskeleton", limit: 1 }, context) as {
      moments: Array<{ moment_ref: string }>;
    };
    const current = handlers.play_moment({ moment_ref: search.moments[0]?.moment_ref ?? "" }, context);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await expect(handlers.play_moment({ moment_ref: "wmv_ZZZZZZZZZZZZZZZZZZZZZZ" }, context))
      .rejects.toThrow("rights_denied");
    release?.();
    await expect(current).resolves.toMatchObject({ status: "sought", requested_seconds: 46 });
    expect(player.playMoment).toHaveBeenCalledOnce();
    expect(audit.mock.calls.map(([entry]) => entry).some((entry) => entry.safe_error_code === "play_superseded")).toBe(false);
  });
});
