import { describe, expect, it, vi } from "vitest";
import { PageToolLifecycle } from "#video/adapter/lifecycle";
import { registerPageTools } from "#video/adapter/register-tools";
import { assertSafeResult, validateToolResult } from "#video/adapter/results";
import type { DocumentWithModelContext, ModelContextTool, PageConfig, ToolHandler, ToolHandlers, ToolId } from "#video/adapter/types";

const config: PageConfig = {
  contract_version: "1.0",
  page_mapping: "page_public_demo_v1",
  enabled_tools: ["search_this_catalog", "get_moment_context", "play_moment"],
  kill_switch: false,
  fixture_path: "/fixtures/rights-safe-catalog.v1.json",
};

const validMoment = {
  title: "Example video",
  start_seconds: 46,
  end_seconds: 52,
  evidence: "The exact evidence appears here.",
  moment_ref: "wmv_AAAAAAAAAAAAAAAAAAAAAA",
  expires_at: "2030-01-01T00:00:00.000Z",
  open_url: "https://www.youtube.com/watch?v=t82C_EYja18&t=46s",
};

const validPlay = {
  status: "sought",
  requested_seconds: 46,
  observed_seconds: 46,
  player_state: "paused",
  moment_ref: validMoment.moment_ref,
  expires_at: validMoment.expires_at,
  open_url: validMoment.open_url,
};

async function registeredExecute(toolId: ToolId, result: unknown): Promise<ToolHandler> {
  const definitions = new Map<ToolId, ModelContextTool>();
  const handler = vi.fn(async () => result);
  const handlers: ToolHandlers = {
    search_this_catalog: handler,
    get_moment_context: handler,
    play_moment: handler,
  };
  const document = {
    modelContext: {
      registerTool: async (definition: ModelContextTool) => {
        definitions.set(definition.name, definition);
      },
    },
  } as unknown as DocumentWithModelContext;
  await registerPageTools({ document, config, handlers, lifecycle: new PageToolLifecycle() });
  const execute = definitions.get(toolId)?.execute;
  if (!execute) throw new Error("test_registration_failed");
  return execute;
}

describe("result safety", () => {
  it("accepts canonical results and returns a detached copy", () => {
    const result = { ...validPlay };
    const returned = validateToolResult("play_moment", result, 1200);
    expect(returned).toEqual(result);
    expect(returned).not.toBe(result);
  });

  it("rejects embedded media URLs, including control-character bypasses", async () => {
    const mediaUrl = [["ht", "tps:"].join(""), "", ["media", "example"].join("."), ["video", "m3u8"].join(".")].join("/");
    const execute = await registeredExecute("search_this_catalog", {
      moments: [{ ...validMoment, evidence: `Playback: ${mediaUrl}` }],
    });
    await expect(execute({}, { signal: new AbortController().signal })).rejects.toThrow("unexpected_result_url");

    const tabbed = await registeredExecute("search_this_catalog", {
      moments: [{ ...validMoment, evidence: "Playback: https:/\t/media.example/video" }],
    });
    await expect(tabbed({}, { signal: new AbortController().signal })).rejects.toThrow("unexpected_result_url");
  });

  it("rejects unsafe fields and extra official-link parameters", () => {
    const unsafeField = ["stream", "_url"].join("");
    expect(() => assertSafeResult({ [unsafeField]: "none" })).toThrow("unsafe_result_field");
    expect(() => validateToolResult("play_moment", {
      ...validPlay,
      open_url: `${validPlay.open_url}&tracking=private`,
    }, 1200)).toThrow("unsafe_result_url");
  });

  it("rejects prototypes, accessors, cycles, and special object keys", async () => {
    const inherited = Object.create(validPlay) as unknown;
    const executeInherited = await registeredExecute("play_moment", inherited);
    await expect(executeInherited({}, { signal: new AbortController().signal })).rejects.toThrow("invalid_tool_result");

    const accessor = { ...validPlay } as Record<string, unknown>;
    Object.defineProperty(accessor, "status", { enumerable: true, get: () => "sought" });
    expect(() => validateToolResult("play_moment", accessor, 1200)).toThrow("invalid_tool_result");

    const cycle: Record<string, unknown> = { ...validPlay };
    cycle.extra = cycle;
    expect(() => validateToolResult("play_moment", cycle, 1200)).toThrow("invalid_tool_result");

    const special = { ...validPlay } as Record<string, unknown>;
    Object.defineProperty(special, "__proto__", { enumerable: true, value: { injected: true } });
    expect(() => validateToolResult("play_moment", special, 1200)).toThrow("unsafe_result_field");
  });

  it("rejects reversed times, mismatched links, and untruthful states", () => {
    expect(() => validateToolResult("search_this_catalog", {
      moments: [{ ...validMoment, start_seconds: 52, end_seconds: 46 }],
    }, 1500)).toThrow("invalid_tool_result");
    expect(() => validateToolResult("play_moment", {
      ...validPlay,
      open_url: "https://www.youtube.com/watch?v=t82C_EYja18&t=47s",
    }, 1200)).toThrow("invalid_tool_result");
    expect(() => validateToolResult("play_moment", {
      ...validPlay,
      player_state: "cued",
    }, 1200)).toThrow("invalid_tool_result");
  });

  it("rejects results that exceed the published output budgets", () => {
    expect(() => validateToolResult("search_this_catalog", {
      moments: [{ ...validMoment, evidence: "a".repeat(1300) }, { ...validMoment, moment_ref: "wmv_BBBBBBBBBBBBBBBBBBBBBB" }],
    }, 1500)).toThrow("tool_result_too_large");
    expect(() => validateToolResult("get_moment_context", {
      ...validMoment,
      visual_description: "a".repeat(1300),
    }, 1500)).toThrow("tool_result_too_large");
    expect(() => validateToolResult("play_moment", {
      ...validPlay,
      title: "a".repeat(1200),
    }, 1200)).toThrow("tool_result_too_large");
  });
});
