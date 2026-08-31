import { describe, expect, it, vi } from "vitest";
import { FIXED_PAGE_CONFIG_PATH, loadPageConfig, parsePageConfig } from "#video/adapter/page-config";

const config = {
  contract_version: "1.0",
  page_mapping: "page_public_demo_v1",
  enabled_tools: ["search_this_catalog", "get_moment_context", "play_moment"],
  kill_switch: false,
  fixture_path: "/fixtures/rights-safe-catalog.v1.json",
};

describe("page scope", () => {
  it("rejects any browser field that can change protected scope", () => {
    for (const field of ["creator", "tenant", "library", "video", "endpoint", "url", "stream", "playback_token"]) {
      expect(() => parsePageConfig({ ...config, [field]: "attacker_value" })).toThrow("invalid_page_config");
    }
  });

  it("requires the exact three-tool order", () => {
    expect(() => parsePageConfig({ ...config, enabled_tools: config.enabled_tools.slice(0, 2) }))
      .toThrow("invalid_enabled_tools");
    expect(() => parsePageConfig({ ...config, enabled_tools: [...config.enabled_tools].reverse() }))
      .toThrow("invalid_enabled_tools");
  });

  it("loads configuration only from the page origin", async () => {
    expect(FIXED_PAGE_CONFIG_PATH).toBe("/page-tools.json");
    const location = { href: "https://demo.example/page", origin: "https://demo.example" } as Location;
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(config), { status: 200 }));
    await expect(loadPageConfig("/page-tools.json", location, fetchImpl as typeof fetch)).resolves.toMatchObject(config);
    await expect(loadPageConfig("https://outside.example/page-tools.json", location, fetchImpl as typeof fetch))
      .rejects.toThrow("cross_origin_page_config");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
