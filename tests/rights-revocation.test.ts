import { describe, expect, it, vi } from "vitest";
import fixtureJson from "../public/fixtures/rights-safe-catalog.v1.json";
import { createFixtureHandlers } from "#video/adapter/handlers";
import { ReferenceVault } from "#video/adapter/reference-vault";
import type { OfficialPlayer, PageConfig } from "#video/adapter/types";
import { parseFixture } from "#video/fixture/load-fixture";
import { FixtureRightsStore } from "#video/fixture/rights-store";

const config: PageConfig = {
  contract_version: "1.0",
  page_mapping: "page_public_demo_v1",
  enabled_tools: ["search_this_catalog", "get_moment_context", "play_moment"],
  kill_switch: false,
  fixture_path: "/fixtures/rights-safe-catalog.v1.json",
};

function setup(beforePlayerAction?: () => Promise<void>) {
  const fixture = parseFixture(fixtureJson);
  const rightsStore = new FixtureRightsStore(fixture, new ReferenceVault(config.page_mapping), config.page_mapping);
  const playMoment = vi.fn(async () => ({ status: "sought", observed_seconds: 46, player_state: "paused" } as const));
  const player: OfficialPlayer = { playMoment };
  const handlers = createFixtureHandlers({
    config,
    fixture,
    rightsStore,
    player,
    audit: vi.fn(),
    ...(beforePlayerAction ? { beforePlayerAction } : {}),
  });
  return { fixture, rightsStore, handlers, playMoment };
}

async function referenceFromSearch(handlers: ReturnType<typeof createFixtureHandlers>): Promise<string> {
  const result = await handlers.search_this_catalog({ query: "motorized exoskeleton", limit: 1 }, {
    signal: new AbortController().signal,
  }) as { moments: Array<{ moment_ref: string }> };
  return result.moments[0]?.moment_ref ?? "";
}

describe("rights revocation", () => {
  it("denies a reference revoked before playback", async () => {
    const setupResult = setup();
    const momentRef = await referenceFromSearch(setupResult.handlers);
    setupResult.rightsStore.setState("outdoor_device", "revoked");
    await expect(setupResult.handlers.play_moment({ moment_ref: momentRef }, {
      signal: new AbortController().signal,
    })).rejects.toThrow("rights_denied");
    expect(setupResult.playMoment).not.toHaveBeenCalled();
  });

  it("denies revocation between authorization and the player action", async () => {
    let rightsStore: FixtureRightsStore;
    const setupResult = setup(async () => rightsStore.setState("outdoor_device", "revoked"));
    rightsStore = setupResult.rightsStore;
    const momentRef = await referenceFromSearch(setupResult.handlers);
    await expect(setupResult.handlers.play_moment({ moment_ref: momentRef }, {
      signal: new AbortController().signal,
    })).rejects.toThrow("rights_denied");
    expect(setupResult.playMoment).not.toHaveBeenCalled();
  });
});
