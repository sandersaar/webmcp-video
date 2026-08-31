import manifestJson from "#video/contracts/manifest.json";
import contextInput from "#video/contracts/schemas/get_moment_context.input.schema.json";
import playInput from "#video/contracts/schemas/play_moment.input.schema.json";
import searchInput from "#video/contracts/schemas/search_this_catalog.input.schema.json";
import type { PageToolLifecycle } from "./lifecycle";
import { validateToolResult } from "./results";
import { TOOL_IDS } from "./types";
import type { DocumentWithModelContext, PageConfig, ToolHandlers, ToolId } from "./types";

const inputSchemas: Readonly<Record<ToolId, unknown>> = {
  search_this_catalog: searchInput,
  get_moment_context: contextInput,
  play_moment: playInput,
};

type PublicTool = Readonly<{
  id: ToolId;
  title: string;
  description: string;
  readOnlyHint: boolean;
  untrustedContentHint: boolean;
  maxOutputCharacters: number;
}>;

const manifest = manifestJson as Readonly<{ contractVersion: string; tools: readonly PublicTool[] }>;

function hasExactTools(config: PageConfig): boolean {
  return config.enabled_tools.length === TOOL_IDS.length &&
    TOOL_IDS.every((toolId, index) => config.enabled_tools[index] === toolId);
}

export async function registerPageTools(input: Readonly<{
  document: DocumentWithModelContext;
  config: PageConfig;
  handlers: ToolHandlers;
  lifecycle: PageToolLifecycle;
}>): Promise<Readonly<{ supported: boolean; registered: readonly ToolId[]; signal?: AbortSignal }>> {
  const modelContext = input.document.modelContext;
  if (!modelContext?.registerTool) return { supported: false, registered: [] };
  if (manifest.contractVersion !== input.config.contract_version) throw new Error("manifest_version_mismatch");
  if (!hasExactTools(input.config)) throw new Error("invalid_tool_surface");

  const registration = input.lifecycle.begin(input.config);
  if (!registration.shouldRegister) {
    return { supported: true, registered: [], signal: registration.signal };
  }

  const registered: ToolId[] = [];
  try {
    for (const toolId of TOOL_IDS) {
      const tool = manifest.tools.find((candidate) => candidate.id === toolId);
      if (!tool) throw new Error("manifest_tool_missing");
      await modelContext.registerTool({
        name: tool.id,
        title: tool.title,
        description: tool.description,
        inputSchema: inputSchemas[tool.id],
        annotations: {
          readOnlyHint: tool.readOnlyHint,
          untrustedContentHint: tool.untrustedContentHint,
        },
        execute: async (value, context) => validateToolResult(
          tool.id,
          await input.handlers[tool.id](value, context),
          tool.maxOutputCharacters,
        ),
      }, { signal: registration.signal });
      registered.push(tool.id);
    }
  } catch (error) {
    input.lifecycle.teardown("registration_failed");
    throw error;
  }

  return { supported: true, registered, signal: registration.signal };
}
