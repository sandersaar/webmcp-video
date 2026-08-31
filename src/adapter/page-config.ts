import { TOOL_IDS } from "./types";
import type { PageConfig } from "./types";

const allowedKeys = ["contract_version", "enabled_tools", "fixture_path", "kill_switch", "page_mapping"].sort();
export const FIXED_FIXTURE_PATH = "/fixtures/rights-safe-catalog.v1.json" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parsePageConfig(value: unknown): PageConfig {
  if (!isRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(allowedKeys)) {
    throw new Error("invalid_page_config");
  }
  if (value.contract_version !== "1.0") throw new Error("unsupported_contract_version");
  if (typeof value.page_mapping !== "string" || !/^[A-Za-z0-9._~-]{12,160}$/.test(value.page_mapping)) {
    throw new Error("invalid_page_mapping");
  }
  if (value.fixture_path !== FIXED_FIXTURE_PATH) throw new Error("invalid_fixture_path");
  if (typeof value.kill_switch !== "boolean") throw new Error("invalid_kill_switch");
  if (!Array.isArray(value.enabled_tools) ||
      JSON.stringify(value.enabled_tools) !== JSON.stringify(TOOL_IDS)) {
    throw new Error("invalid_enabled_tools");
  }
  return {
    contract_version: "1.0",
    page_mapping: value.page_mapping,
    enabled_tools: TOOL_IDS,
    kill_switch: value.kill_switch,
    fixture_path: FIXED_FIXTURE_PATH,
  };
}

export async function loadPageConfig(
  configPath: string,
  pageLocation: Location = globalThis.location,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<PageConfig> {
  const configUrl = new URL(configPath, pageLocation.href);
  if (configUrl.origin !== pageLocation.origin) throw new Error("cross_origin_page_config");
  const response = await fetchImpl(configUrl, { credentials: "same-origin" });
  if (!response.ok) throw new Error("page_config_unavailable");
  return parsePageConfig(await response.json());
}
