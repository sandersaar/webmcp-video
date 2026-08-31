import type { PageConfig } from "./types";

export class PageToolLifecycle {
  private controller: AbortController | undefined;
  private fingerprint: string | undefined;

  begin(config: PageConfig): Readonly<{ signal: AbortSignal; shouldRegister: boolean }> {
    const fingerprint = JSON.stringify(config);
    if (config.kill_switch) {
      this.teardown("kill_switch");
      const controller = new AbortController();
      controller.abort("kill_switch");
      return { signal: controller.signal, shouldRegister: false };
    }
    if (this.controller && !this.controller.signal.aborted && this.fingerprint === fingerprint) {
      return { signal: this.controller.signal, shouldRegister: false };
    }
    this.controller?.abort("page_mapping_changed");
    this.controller = new AbortController();
    this.fingerprint = fingerprint;
    return { signal: this.controller.signal, shouldRegister: true };
  }

  teardown(reason = "page_teardown"): void {
    this.controller?.abort(reason);
    this.controller = undefined;
    this.fingerprint = undefined;
  }
}

export function installNavigationCleanup(targetWindow: Window, lifecycle: PageToolLifecycle): () => void {
  const cleanup = () => lifecycle.teardown("navigation");
  targetWindow.addEventListener("pagehide", cleanup, { once: true });
  targetWindow.addEventListener("popstate", cleanup, { once: true });
  return cleanup;
}
