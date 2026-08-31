import { createFixtureHandlers } from "#video/adapter/handlers";
import { installNavigationCleanup, PageToolLifecycle } from "#video/adapter/lifecycle";
import { FIXED_PAGE_CONFIG_PATH, loadPageConfig } from "#video/adapter/page-config";
import { mountOfficialPlayer } from "#video/adapter/player";
import { ReferenceVault } from "#video/adapter/reference-vault";
import { registerPageTools } from "#video/adapter/register-tools";
import type { AuditEntry, DocumentWithModelContext, ToolId } from "#video/adapter/types";
import { loadFixture } from "#video/fixture/load-fixture";
import { FixtureRightsStore } from "#video/fixture/rights-store";
import { createLocalAudit } from "./audit-panel";
import { mountFlowPanel } from "./flow-panel";

declare global {
  interface Window {
    __webmcpVideoLocalDemo?: Readonly<{
      invoke(toolId: ToolId, value: unknown): Promise<unknown>;
      revokeReference(momentRef: string): void;
      auditEntries(): readonly AuditEntry[];
    }>;
  }
}

export async function bootDemo(targetWindow: Window = window, targetDocument: Document = document) {
  const [config, fixture] = await Promise.all([
    loadPageConfig(FIXED_PAGE_CONFIG_PATH, targetWindow.location),
    loadFixture("/fixtures/rights-safe-catalog.v1.json", targetWindow.location),
  ]);
  const playerElement = targetDocument.getElementById("official-player");
  const auditElement = targetDocument.getElementById("audit-panel");
  const flowElement = targetDocument.getElementById("flow-panel");
  if (!playerElement || !auditElement || !flowElement) throw new Error("demo_markup_missing");

  const lifecycle = new PageToolLifecycle();
  const references = new ReferenceVault(config.page_mapping);
  const rightsStore = new FixtureRightsStore(fixture, references, config.page_mapping);
  const player = mountOfficialPlayer(
    targetWindow,
    targetDocument,
    playerElement,
    fixture.videos[0]?.youtube_video_id ?? "",
  );
  const audit = createLocalAudit(auditElement);
  const handlers = createFixtureHandlers({
    config,
    fixture,
    player,
    rightsStore,
    audit: audit.record,
  });
  mountFlowPanel(flowElement, handlers);
  const registration = await registerPageTools({
    document: targetDocument as DocumentWithModelContext,
    config,
    handlers,
    lifecycle,
  });
  installNavigationCleanup(targetWindow, lifecycle);

  const status = targetDocument.getElementById("runtime-status");
  if (status) {
    status.textContent = registration.supported
      ? `Registered ${registration.registered.length} page tools.`
      : "WebMCP is unavailable. The local demo controls still work.";
  }

  if (targetWindow.location.hostname === "127.0.0.1" || targetWindow.location.hostname === "localhost") {
    Object.defineProperty(targetWindow, "__webmcpVideoLocalDemo", {
      configurable: true,
      value: Object.freeze({
        invoke: (toolId: ToolId, value: unknown) => handlers[toolId](value, {
          signal: new AbortController().signal,
        }),
        revokeReference: (momentRef: string) => rightsStore.revokeReference(momentRef),
        auditEntries: audit.entries,
      }),
    });
  }
  return { registration };
}

void bootDemo().catch((error: unknown) => {
  const status = document.getElementById("runtime-status");
  if (status) status.textContent = error instanceof Error ? error.message : "demo_failed";
});
