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
