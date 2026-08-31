import type { Page } from "@playwright/test";

export type RuntimeOptions = Readonly<{
  missingRuntime?: boolean;
  state?: number;
  videoId?: string;
  seconds?: number;
  lateAutoplayBlocked?: boolean;
  lateError?: boolean;
  freezeObservation?: boolean;
  missingVideoDataAfterCueReads?: number;
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
        missingVideoDataReads: 0,
        hasCued: false,
      },
    };
    Object.defineProperty(window, "__webmcpTestRuntime", { configurable: true, value: runtime });
    Object.defineProperty(window, "YT", {
      configurable: true,
      value: {
        Player: class {
          constructor(element: HTMLIFrameElement, playerOptions: {
            events: {
              onReady(event: { target: unknown }): void;
              onError(): void;
              onAutoplayBlocked(): void;
            };
          }) {
            if (element.tagName !== "IFRAME") throw new Error("youtube_iframe_missing");
            const driver = {
              getCurrentTime: () => runtime.driver.seconds,
              getPlayerState: () => runtime.driver.state,
              getVideoData: () => {
                if (runtime.driver.missingVideoDataReads > 0) {
                  runtime.driver.missingVideoDataReads -= 1;
                  return undefined;
                }
                return { video_id: runtime.driver.videoId };
              },
              seekTo: (seconds: number) => {
                if (!runtime.driver.freezeObservation) runtime.driver.seconds = seconds;
              },
              cueVideoById: ({ videoId, startSeconds }: { videoId: string; startSeconds: number }) => {
                runtime.driver.videoId = videoId;
                if (!runtime.driver.freezeObservation) runtime.driver.seconds = startSeconds;
                runtime.driver.state = 5;
                if (!runtime.driver.hasCued) {
                  runtime.driver.hasCued = true;
                  runtime.driver.missingVideoDataReads = initial.missingVideoDataAfterCueReads ?? 0;
                }
              },
            };
            queueMicrotask(() => {
              playerOptions.events.onReady({ target: driver });
              if (initial.lateError) setTimeout(() => playerOptions.events.onError(), 10);
              if (initial.lateAutoplayBlocked) setTimeout(() => playerOptions.events.onAutoplayBlocked(), 15);
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
