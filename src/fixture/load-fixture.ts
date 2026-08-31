import type { FixtureCatalog, FixtureMoment, FixtureVideo, RightsState } from "#video/adapter/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) throw new Error(code);
}

function text(value: unknown, code: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) throw new Error(code);
  return value;
}

function rightsState(value: unknown): RightsState {
  if (value !== "active" && value !== "revoked") throw new Error("invalid_fixture_rights");
  return value;
}

function moment(value: unknown): FixtureMoment {
  if (!isRecord(value)) throw new Error("invalid_fixture_moment");
  exactKeys(value, ["end_seconds", "evidence", "fixture_key", "rights_state", "start_seconds", "visual_description"], "invalid_fixture_moment");
  const start = value.start_seconds;
  const end = value.end_seconds;
  if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end) ||
      start < 0 || end <= start) throw new Error("invalid_fixture_timing");
  return {
    fixture_key: text(value.fixture_key, "invalid_fixture_key"),
    start_seconds: start,
    end_seconds: end,
    evidence: text(value.evidence, "invalid_fixture_evidence"),
    visual_description: text(value.visual_description, "invalid_fixture_visual"),
    rights_state: rightsState(value.rights_state),
  };
}

function video(value: unknown): FixtureVideo {
  if (!isRecord(value) || !Array.isArray(value.moments) || value.moments.length === 0) {
    throw new Error("invalid_fixture_video");
  }
  exactKeys(value, ["fixture_key", "moments", "rights_state", "title", "youtube_video_id"], "invalid_fixture_video");
  const youtubeVideoId = text(value.youtube_video_id, "invalid_fixture_video_id");
  if (!/^[A-Za-z0-9_-]{11}$/.test(youtubeVideoId)) throw new Error("invalid_fixture_video_id");
  return {
    fixture_key: text(value.fixture_key, "invalid_fixture_key"),
    title: text(value.title, "invalid_fixture_title"),
    youtube_video_id: youtubeVideoId,
    rights_state: rightsState(value.rights_state),
    moments: value.moments.map(moment),
  };
}

export function parseFixture(value: unknown): FixtureCatalog {
  if (!isRecord(value) || value.contract_version !== "1.0" ||
      value.fixture_handler !== "rights-safe-catalog-v1" ||
      typeof value.page_mapping !== "string" || !Array.isArray(value.videos) || value.videos.length === 0) {
    throw new Error("invalid_fixture");
  }
  exactKeys(value, ["contract_version", "fixture_handler", "page_mapping", "videos"], "invalid_fixture");
  const videos = value.videos.map(video);
  const keys = videos.flatMap((entry) => [entry.fixture_key, ...entry.moments.map((candidate) => candidate.fixture_key)]);
  if (new Set(keys).size !== keys.length) throw new Error("duplicate_fixture_key");
  return {
    contract_version: "1.0",
    fixture_handler: "rights-safe-catalog-v1",
    page_mapping: value.page_mapping,
    videos,
  };
}

export async function loadFixture(
  fixturePath: string,
  pageLocation: Location = globalThis.location,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<FixtureCatalog> {
  const fixtureUrl = new URL(fixturePath, pageLocation.href);
  if (fixtureUrl.origin !== pageLocation.origin) throw new Error("cross_origin_fixture");
  const response = await fetchImpl(fixtureUrl, { credentials: "same-origin" });
  if (!response.ok) throw new Error("fixture_unavailable");
  return parseFixture(await response.json());
}
