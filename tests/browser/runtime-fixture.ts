import type { Page } from "@playwright/test";

export type RuntimeOptions = Readonly<{
  missingRuntime?: boolean;
  state?: number;
  videoId?: string;
  seconds?: number;
  autoplayBlocked?: boolean;
  freezeObservation?: boolean;
}>;

export async function installRuntime(page: Page, options: RuntimeOptions = {}): Promise<void> {
  await page.addInitScript((initial) => {
    const runtime = {
      tools: new Map<string, { execute(input: unknown, context: { signal: AbortSignal }): Promise<unknown> }>(),
      driver: {
        state: initial.state ?? 1,
        videoId: initial.videoId ?? "t82C_EYja18",
        seconds: initial.seconds ?? 0,
        freezeObservation: initial.freezeObservation ?? false,
      },
    };
    Object.defineProperty(window, "__webmcpTestRuntime", { configurable: true, value: runtime });
    Object.defineProperty(window, "YT", {
      configurable: true,
      value: {
        Player: class {
          constructor(_element: HTMLElement, playerOptions: {
            videoId: string;
            events: {
              onReady(event: { target: unknown }): void;
              onAutoplayBlocked(): void;
            };
          }) {
            const driver = {
              getCurrentTime: () => runtime.driver.seconds,
              getPlayerState: () => runtime.driver.state,
              getVideoData: () => ({ video_id: runtime.driver.videoId }),
              seekTo: (seconds: number) => {
                if (!runtime.driver.freezeObservation) runtime.driver.seconds = seconds;
              },
              cueVideoById: ({ videoId, startSeconds }: { videoId: string; startSeconds: number }) => {
                runtime.driver.videoId = videoId;
                if (!runtime.driver.freezeObservation) runtime.driver.seconds = startSeconds;
                runtime.driver.state = 5;
              },
            };
            queueMicrotask(() => {
              playerOptions.events.onReady({ target: driver });
              if (initial.autoplayBlocked) playerOptions.events.onAutoplayBlocked();
            });
            return driver;
          }
        },
      },
    });
    if (!initial.missingRuntime) {
      Object.defineProperty(document, "modelContext", {
        configurable: true,
        value: {
          registerTool: async (definition: { name: string; execute(input: unknown, context: { signal: AbortSignal }): Promise<unknown> }) => {
            runtime.tools.set(definition.name, definition);
          },
        },
      });
    }
  }, options);
}
