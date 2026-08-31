import type { OfficialPlayer, PlayAuthorization, PlayerResult, PlayerState } from "./types";

type YouTubeDriver = Readonly<{
  getCurrentTime(): number;
  getPlayerState(): number;
  getVideoData(): Readonly<{ video_id?: string }>;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  cueVideoById(input: Readonly<{ videoId: string; startSeconds: number }>): void;
}>;

type YouTubeWindow = Window & {
  YT?: {
    Player: new (
      element: HTMLElement,
      options: Readonly<{
        videoId: string;
        playerVars: Readonly<{ enablejsapi: 1; origin: string; playsinline: 1 }>;
        events: Readonly<{
          onReady(event: Readonly<{ target: YouTubeDriver }>): void;
          onStateChange(event: Readonly<{ data: number }>): void;
          onError(): void;
          onAutoplayBlocked(): void;
        }>;
      }>,
    ) => YouTubeDriver;
  };
  onYouTubeIframeAPIReady?: () => void;
};

const stateNames: Record<number, PlayerState> = {
  [-1]: "unstarted",
  [0]: "ended",
  [1]: "playing",
  [2]: "paused",
  [3]: "buffering",
  [5]: "cued",
};

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function fallback(playerState: PlayerState = "unknown"): PlayerResult {
  return { status: "fallback", observed_seconds: null, player_state: playerState };
}

export class SupersededPlayError extends Error {
  readonly code = "play_superseded";
}

export function isSupersededPlayError(error: unknown): error is SupersededPlayError {
  return error instanceof SupersededPlayError;
}

export class YouTubeOfficialPlayer implements OfficialPlayer {
  private failed = false;
  private autoplayBlocked = false;
  private activeOperation: AbortController | undefined;

  constructor(
    private readonly ready: Promise<YouTubeDriver | undefined>,
    private readonly delay: (milliseconds: number) => Promise<void> =
      (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    private readonly readinessTimeoutMilliseconds = 5_000,
    private readonly observationAttempts = 40,
  ) {}

  markError(): void {
    this.failed = true;
  }

  markAutoplayBlocked(): void {
    this.autoplayBlocked = true;
  }

  private async waitUntilReady(signal: AbortSignal): Promise<YouTubeDriver | undefined> {
    if (signal.aborted) throw abortError();
    return await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (driver: YouTubeDriver | undefined, error?: DOMException) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener("abort", onAbort);
        if (error) reject(error);
        else resolve(driver);
      };
      const onAbort = () => finish(undefined, abortError());
      const timeout = setTimeout(() => finish(undefined), this.readinessTimeoutMilliseconds);
      signal.addEventListener("abort", onAbort, { once: true });
      this.ready.then((driver) => finish(driver), () => finish(undefined));
    });
  }

  async playMoment(authorization: PlayAuthorization, callerSignal: AbortSignal): Promise<PlayerResult> {
    this.activeOperation?.abort("superseded");
    const operation = new AbortController();
    this.activeOperation = operation;
    const linked = new AbortController();
    const abortFromCaller = () => linked.abort("caller");
    const abortFromOperation = () => linked.abort("superseded");
    callerSignal.addEventListener("abort", abortFromCaller, { once: true });
    operation.signal.addEventListener("abort", abortFromOperation, { once: true });
    if (callerSignal.aborted) linked.abort("caller");

    const assertCurrent = () => {
      if (operation.signal.aborted) throw new SupersededPlayError("play_superseded");
      if (callerSignal.aborted) throw abortError();
    };

    try {
      assertCurrent();
      let driver: YouTubeDriver | undefined;
      try {
        driver = await this.waitUntilReady(linked.signal);
      } catch (error) {
        assertCurrent();
        throw error;
      }
      assertCurrent();
      if (!driver || this.failed) return fallback(this.failed ? "unavailable" : "unknown");

      const stateBefore = stateNames[driver.getPlayerState()] ?? "unknown";
      const loaded = driver.getVideoData().video_id === authorization.youtube_video_id &&
        ["playing", "paused", "buffering"].includes(stateBefore);
      if (loaded) driver.seekTo(authorization.requested_seconds, true);
      else driver.cueVideoById({
        videoId: authorization.youtube_video_id,
        startSeconds: authorization.requested_seconds,
      });

      for (let attempt = 0; attempt < this.observationAttempts; attempt += 1) {
        assertCurrent();
        if (this.failed) return fallback("unavailable");
        const observedVideoId = driver.getVideoData().video_id;
        const observedState = stateNames[driver.getPlayerState()] ?? "unknown";
        const currentTime = driver.getCurrentTime();
        const observedSeconds = Number.isFinite(currentTime) ? currentTime : null;
        const withinTolerance = observedSeconds !== null &&
          Math.abs(observedSeconds - authorization.requested_seconds) <= 1;
        if (observedVideoId === authorization.youtube_video_id) {
          if (this.autoplayBlocked && withinTolerance && ["paused", "cued"].includes(observedState)) {
            return { status: "needs_user", observed_seconds: observedSeconds, player_state: observedState };
          }
          if (!loaded && observedState === "cued") {
            return { status: "cued", observed_seconds: null, player_state: "cued" };
          }
          if (loaded && withinTolerance && ["playing", "paused", "buffering"].includes(observedState)) {
            return { status: "sought", observed_seconds: observedSeconds, player_state: observedState };
          }
        }
        if (attempt < this.observationAttempts - 1) await this.delay(25);
      }
      return fallback();
    } finally {
      callerSignal.removeEventListener("abort", abortFromCaller);
      operation.signal.removeEventListener("abort", abortFromOperation);
      if (this.activeOperation === operation) this.activeOperation = undefined;
    }
  }
}

export function mountOfficialPlayer(
  targetWindow: YouTubeWindow,
  targetDocument: Document,
  element: HTMLElement,
  youtubeVideoId: string,
  readinessTimeoutMilliseconds = 5_000,
): YouTubeOfficialPlayer {
  let resolveReady: (driver: YouTubeDriver | undefined) => void = () => undefined;
  const ready = new Promise<YouTubeDriver | undefined>((resolve) => {
    resolveReady = resolve;
  });
  const controller = new YouTubeOfficialPlayer(ready, undefined, readinessTimeoutMilliseconds);
  let initialized = false;
  const initialize = () => {
    if (initialized) return;
    initialized = true;
    if (!targetWindow.YT?.Player) {
      resolveReady(undefined);
      return;
    }
    new targetWindow.YT.Player(element, {
      videoId: youtubeVideoId,
      playerVars: { enablejsapi: 1, origin: targetWindow.location.origin, playsinline: 1 },
      events: {
        onReady: (event) => resolveReady(event.target),
        onStateChange: () => undefined,
        onError: () => controller.markError(),
        onAutoplayBlocked: () => controller.markAutoplayBlocked(),
      },
    });
  };
  if (targetWindow.YT?.Player) initialize();
  else {
    const priorReady = targetWindow.onYouTubeIframeAPIReady;
    targetWindow.onYouTubeIframeAPIReady = () => {
      priorReady?.();
      initialize();
    };
    const script = targetDocument.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.addEventListener("error", () => {
      controller.markError();
      resolveReady(undefined);
    }, { once: true });
    targetDocument.head.append(script);
  }
  return controller;
}

export function playerForTests(driver: YouTubeDriver | undefined): YouTubeOfficialPlayer {
  return new YouTubeOfficialPlayer(Promise.resolve(driver), async () => undefined);
}
