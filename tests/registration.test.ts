import { describe, expect, it, vi } from "vitest";
import { PageToolLifecycle } from "#video/adapter/lifecycle";
import { registerPageTools } from "#video/adapter/register-tools";
import manifest from "#video/contracts/manifest.json";
import type { DocumentWithModelContext, ModelContextTool, PageConfig, ToolHandlers } from "#video/adapter/types";

const config: PageConfig = {
  contract_version: "1.0",
  page_mapping: "page_public_demo_v1",
  enabled_tools: ["search_this_catalog", "get_moment_context", "play_moment"],
  kill_switch: false,
  fixture_path: "/fixtures/rights-safe-catalog.v1.json",
};

const handler = vi.fn(async () => ({}));
const handlers: ToolHandlers = {
  search_this_catalog: handler,
  get_moment_context: handler,
  play_moment: handler,
};

describe("tool registration", () => {
  it("keeps the approved sequence, plain descriptions, and output budgets", () => {
    expect(manifest.tools.map((tool) => tool.id)).toEqual(config.enabled_tools);
    expect(manifest.tools.map((tool) => tool.description)).toEqual([
      "Search this page's video catalog. Returns matching moments and a moment_ref for each result.",
      "Explain one search result using its moment_ref. This tool does not change the player.",
      "Get the page's official video player ready at an exact moment. Use a moment_ref from search_this_catalog.",
    ]);
    expect(manifest.tools.map((tool) => tool.maxOutputCharacters)).toEqual([1500, 1500, 1200]);
    expect(manifest.tools.every((tool) => tool.maxOutputCharacters <= 1500)).toBe(true);
  });

  it("awaits exactly three registrations and omits unsupported fields", async () => {
    const definitions: ModelContextTool[] = [];
    const resolvers: Array<() => void> = [];
    const registerTool = vi.fn((definition: ModelContextTool) => new Promise<void>((resolve) => {
      definitions.push(definition);
      resolvers.push(resolve);
    }));
    const document = { modelContext: { registerTool } } as unknown as DocumentWithModelContext;
    let settled = false;
    const pending = registerPageTools({ document, config, handlers, lifecycle: new PageToolLifecycle() })
      .then((result) => {
        settled = true;
        return result;
      });

    await vi.waitFor(() => expect(resolvers).toHaveLength(1));
    expect(settled).toBe(false);
    resolvers.shift()?.();
    await vi.waitFor(() => expect(resolvers).toHaveLength(1));
    resolvers.shift()?.();
    await vi.waitFor(() => expect(resolvers).toHaveLength(1));
    resolvers.shift()?.();

    await expect(pending).resolves.toMatchObject({
      supported: true,
      registered: ["search_this_catalog", "get_moment_context", "play_moment"],
    });
    const unsupportedKey = ["output", "Schema"].join("");
    expect(definitions).toHaveLength(3);
    expect(definitions.every((definition) => !Object.hasOwn(definition, unsupportedKey))).toBe(true);
  });

  it("aborts prior registrations after a registration failure", async () => {
    const signals: AbortSignal[] = [];
    const registerTool = vi.fn(async (_definition: ModelContextTool, options: { signal: AbortSignal }) => {
      signals.push(options.signal);
      if (signals.length === 2) throw new Error("registration_rejected");
    });
    const document = { modelContext: { registerTool } } as unknown as DocumentWithModelContext;
    await expect(registerPageTools({ document, config, handlers, lifecycle: new PageToolLifecycle() }))
      .rejects.toThrow("registration_rejected");
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("does not duplicate registration and leaves unsupported pages unchanged", async () => {
    const registerTool = vi.fn(async () => undefined);
    const document = { modelContext: { registerTool } } as unknown as DocumentWithModelContext;
    const lifecycle = new PageToolLifecycle();
    await expect(registerPageTools({ document, config, handlers, lifecycle })).resolves.toMatchObject({ registered: config.enabled_tools });
    await expect(registerPageTools({ document, config, handlers, lifecycle })).resolves.toMatchObject({ registered: [] });
    expect(registerTool).toHaveBeenCalledTimes(3);
    await expect(registerPageTools({
      document: {} as DocumentWithModelContext,
      config,
      handlers,
      lifecycle: new PageToolLifecycle(),
    })).resolves.toEqual({ supported: false, registered: [] });
  });

  it("normalizes an omitted host context and combines a supplied cancellation signal", async () => {
    const calls: AbortSignal[] = [];
    let releaseSecond: (() => void) | undefined;
    const contextHandlers: ToolHandlers = {
      search_this_catalog: vi.fn(async (_value, context) => {
        calls.push(context.signal);
        if (calls.length === 2) await new Promise<void>((resolve) => { releaseSecond = resolve; });
        return { moments: [] };
      }),
      get_moment_context: handler,
      play_moment: handler,
    };
    const definitions: ModelContextTool[] = [];
    const document = {
      modelContext: {
        registerTool: vi.fn(async (definition: ModelContextTool) => { definitions.push(definition); }),
      },
    } as unknown as DocumentWithModelContext;
    const lifecycle = new PageToolLifecycle();
    await registerPageTools({ document, config, handlers: contextHandlers, lifecycle });

    await expect(definitions[0]?.execute({ query: "robotic massage" })).resolves.toEqual({ moments: [] });
    expect(calls[0]?.aborted).toBe(false);

    const caller = new AbortController();
    const suppliedExecution = definitions[0]?.execute(
      { query: "robotic massage" },
      { signal: caller.signal },
    );
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    caller.abort("caller_cancelled");
    expect(calls[1]?.aborted).toBe(true);
    releaseSecond?.();
    await expect(suppliedExecution).resolves.toEqual({ moments: [] });
  });
});
