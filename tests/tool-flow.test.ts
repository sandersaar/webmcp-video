import { describe, expect, it, vi } from "vitest";
import fixtureJson from "../public/fixtures/rights-safe-catalog.v1.json";
import { createFixtureHandlers } from "#video/adapter/handlers";
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
});
