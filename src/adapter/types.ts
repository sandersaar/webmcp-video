export const TOOL_IDS = [
  "search_this_catalog",
  "get_moment_context",
  "play_moment",
] as const;

export type ToolId = typeof TOOL_IDS[number];

export type PageConfig = Readonly<{
  contract_version: "1.0";
  page_mapping: string;
  enabled_tools: readonly ToolId[];
  kill_switch: boolean;
  fixture_path: "/fixtures/rights-safe-catalog.v1.json";
}>;

export type ToolExecutionContext = Readonly<{ signal: AbortSignal }>;
export type ToolHandler = (value: unknown, context: ToolExecutionContext) => Promise<unknown>;
export type ToolHandlers = Readonly<Record<ToolId, ToolHandler>>;

export type ModelContextTool = Readonly<{
  name: ToolId;
  title: string;
  description: string;
  inputSchema: unknown;
  annotations: Readonly<{
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  }>;
  execute: ToolHandler;
}>;

export type ModelContext = Readonly<{
  registerTool(
    definition: ModelContextTool,
    options: Readonly<{ signal: AbortSignal }>,
  ): Promise<void>;
}>;

export type DocumentWithModelContext = Document & { modelContext?: ModelContext };

export type RightsState = "active" | "revoked";

export type FixtureMoment = Readonly<{
  fixture_key: string;
  start_seconds: number;
  end_seconds: number;
  evidence: string;
  visual_description: string;
  rights_state: RightsState;
}>;

export type FixtureVideo = Readonly<{
  fixture_key: string;
  title: string;
  youtube_video_id: string;
  rights_state: RightsState;
  moments: readonly FixtureMoment[];
}>;

export type FixtureCatalog = Readonly<{
  contract_version: "1.0";
  fixture_handler: "rights-safe-catalog-v1";
  page_mapping: string;
  videos: readonly FixtureVideo[];
}>;

export type PlayerStatus = "sought" | "cued" | "needs_user" | "fallback";
export type PlayerState =
  | "unstarted"
  | "ended"
  | "playing"
  | "paused"
  | "buffering"
  | "cued"
  | "unavailable"
  | "unknown";

export type PlayerResult = Readonly<{
  status: PlayerStatus;
  observed_seconds: number | null;
  player_state: PlayerState;
}>;

export type PlayAuthorization = Readonly<{
  moment_ref: string;
  expires_at: string;
  title: string;
  youtube_video_id: string;
  requested_seconds: number;
  open_url: string;
}>;

export type OfficialPlayer = Readonly<{
  playMoment(authorization: PlayAuthorization, signal: AbortSignal): Promise<PlayerResult>;
}>;

export type AuditEntry = Readonly<{
  tool_id: ToolId;
  invocation_id: string;
  page_mapping: string;
  moment_ref: string | null;
  rights_decision: "allowed" | "denied" | "filtered" | "not_applicable";
  requested_second: number | null;
  observed_second: number | null;
  player_status: PlayerStatus | null;
  safe_error_code: string | null;
}>;
