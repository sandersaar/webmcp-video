import type { OfficialPlayer, PlayAuthorization, PlayerResult, PlayerState } from "./types";

type YouTubeDriver = Readonly<{
  getCurrentTime(): number;
  getPlayerState(): number;
  getVideoData(): unknown;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  cueVideoById(input: Readonly<{ videoId: string; startSeconds: number }>): void;
}>;

type TimeoutHandle = ReturnType<typeof setTimeout>;

type YouTubeWindow = Window & {
  YT?: {
    Player: new (
      element: HTMLIFrameElement,
      options: Readonly<{
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
  private activeOperation: AbortController | undefined;
  private operationGeneration = 0;

  constructor(
    private readonly ready: Promise<YouTubeDriver | undefined>,
    private readonly delay: (milliseconds: number) => Promise<void> =
      (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    private readonly operationTimeoutMilliseconds = 3_000,
    private readonly settlementGuardMilliseconds = 100,
    private readonly now: () => number = Date.now,
    private readonly scheduleTimeout: (callback: () => void, milliseconds: number) => TimeoutHandle =
      (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
    private readonly cancelTimeout: (handle: TimeoutHandle) => void =
      (handle) => globalThis.clearTimeout(handle),
  ) {}

  private async waitUntilReady(signal: AbortSignal, deadline: number): Promise<YouTubeDriver | undefined> {
    if (signal.aborted) throw abortError();
    return await new Promise((resolve, reject) => {
      let settled = false;
      let timeout: TimeoutHandle | undefined;
      const finish = (driver: YouTubeDriver | undefined, error?: DOMException) => {
        if (settled) return;
        settled = true;
        if (timeout !== undefined) this.cancelTimeout(timeout);
        signal.removeEventListener("abort", onAbort);
        if (error) reject(error);
        else resolve(driver);
      };
      const onAbort = () => finish(undefined, abortError());
      signal.addEventListener("abort", onAbort, { once: true });
      this.ready.then((driver) => finish(driver), () => finish(undefined));
      const remaining = deadline - this.now();
      if (remaining <= 0) finish(undefined);
      else timeout = this.scheduleTimeout(() => finish(undefined), remaining);
    });
  }

  async playMoment(authorization: PlayAuthorization, callerSignal: AbortSignal): Promise<PlayerResult> {
    this.activeOperation?.abort("superseded");
    const operation = new AbortController();
    this.activeOperation = operation;
    const generation = ++this.operationGeneration;
    const linked = new AbortController();
    const abortFromCaller = () => linked.abort("caller");
    const abortFromOperation = () => linked.abort("superseded");
    callerSignal.addEventListener("abort", abortFromCaller, { once: true });
    operation.signal.addEventListener("abort", abortFromOperation, { once: true });
    if (callerSignal.aborted) linked.abort("caller");

    const assertCurrent = () => {
      if (generation !== this.operationGeneration || operation.signal.aborted) {
        throw new SupersededPlayError("play_superseded");
      }
      if (callerSignal.aborted) throw abortError();
    };
    const observe = (driver: YouTubeDriver) => {
      let seconds: number | null = null;
      let videoId: string | undefined;
      let state: PlayerState = "unknown";
      try {
        const value = driver.getCurrentTime();
        seconds = Number.isFinite(value) ? value : null;
      } catch {
        // A provider can briefly reject getters while a cue is settling.
      }
      try {
        const videoData = driver.getVideoData();
        if (typeof videoData === "object" && videoData !== null && "video_id" in videoData &&
          typeof videoData.video_id === "string") {
          videoId = videoData.video_id;
        }
      } catch {
        // A provider can briefly reject getters while a cue is settling.
      }
      try {
        const stateCode = driver.getPlayerState();
        state = stateNames[stateCode] ?? "unknown";
      } catch {
        // A provider can briefly reject getters while a cue is settling.
      }
      return {
        videoId,
        seconds,
        state,
      } as const;
    };

    try {
      assertCurrent();
      const deadline = this.now() + this.operationTimeoutMilliseconds;
      const hasTimeRemaining = () => this.now() < deadline;
      let driver: YouTubeDriver | undefined;
      try {
        driver = await this.waitUntilReady(linked.signal, deadline);
      } catch (error) {
        assertCurrent();
        throw error;
      }
      assertCurrent();
      if (!driver || !hasTimeRemaining()) return fallback();

      let initial;
      try {
        initial = observe(driver);
      } catch {
        return fallback();
      }
      let commandKind: "seek" | "cue" = initial.videoId === authorization.youtube_video_id &&
        ["playing", "paused", "buffering"].includes(initial.state) ? "seek" : "cue";
      const command = () => {
        assertCurrent();
        if (!hasTimeRemaining()) return false;
        const current = observe(driver);
        assertCurrent();
        if (!hasTimeRemaining()) return false;
        commandKind = current.videoId === authorization.youtube_video_id &&
          ["playing", "paused", "buffering"].includes(current.state) ? "seek" : "cue";
        if (commandKind === "seek") {
          driver.seekTo(authorization.requested_seconds, true);
          return true;
        }
        driver.cueVideoById({
          videoId: authorization.youtube_video_id,
          startSeconds: authorization.requested_seconds,
        });
        return true;
      };
      try {
        if (!command()) return fallback();
      } catch (error) {
        assertCurrent();
        return fallback();
      }

      let previous: ReturnType<typeof observe> | undefined;
      let matchingSince: number | undefined;
      let corrections = 0;
      let correctionEligibleAt = this.now() + this.settlementGuardMilliseconds;
      while (hasTimeRemaining()) {
        assertCurrent();
        if (!hasTimeRemaining()) return fallback();
        let current;
        try {
          current = observe(driver);
        } catch {
          assertCurrent();
          return fallback();
        }
        if (!hasTimeRemaining()) return fallback();
        const matching = current.videoId === authorization.youtube_video_id &&
          (commandKind === "seek"
            ? current.seconds !== null && Math.abs(current.seconds - authorization.requested_seconds) <= 1 &&
              ["playing", "paused", "buffering"].includes(current.state)
            : current.seconds !== null && Math.abs(current.seconds - authorization.requested_seconds) <= 1 &&
              current.state === "cued");
        const stable = matching && previous !== undefined && previous.videoId === current.videoId &&
          previous.state === current.state &&
          (current.seconds === null || previous.seconds === null || Math.abs(current.seconds - previous.seconds) <= 1);
        if (matching && matchingSince === undefined) matchingSince = this.now();
        const stableSince = matchingSince;
        if (stable && stableSince !== undefined) {
          if (this.now() >= stableSince + this.settlementGuardMilliseconds && hasTimeRemaining()) {
            if (commandKind === "seek" && current.seconds !== null) {
              return { status: "sought", observed_seconds: current.seconds, player_state: current.state };
            }
            return { status: "cued", observed_seconds: null, player_state: "cued" };
          }
        }
        if (!matching) {
          matchingSince = undefined;
          previous = undefined;
          if (this.now() >= correctionEligibleAt && corrections < 2 && hasTimeRemaining()) {
            corrections += 1;
            try {
              if (!command()) return fallback();
            } catch (error) {
              assertCurrent();
              return fallback();
            }
            correctionEligibleAt = this.now() + this.settlementGuardMilliseconds;
          }
        } else {
          previous = current;
        }
        if (!hasTimeRemaining()) return fallback();
        assertCurrent();
        await this.delay(Math.min(25, Math.max(0, deadline - this.now())));
        assertCurrent();
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
  element: HTMLIFrameElement,
  youtubeVideoId: string,
  operationTimeoutMilliseconds = 3_000,
): YouTubeOfficialPlayer {
  let resolveReady: (driver: YouTubeDriver | undefined) => void = () => undefined;
  const ready = new Promise<YouTubeDriver | undefined>((resolve) => {
    resolveReady = resolve;
  });
  const controller = new YouTubeOfficialPlayer(ready, undefined, operationTimeoutMilliseconds);
  const playerUrl = new URL(`https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeVideoId)}`);
  playerUrl.searchParams.set("enablejsapi", "1");
  playerUrl.searchParams.set("playsinline", "1");
  playerUrl.searchParams.set("origin", targetWindow.location.origin);
  element.src = playerUrl.toString();
  let initialized = false;
  const initialize = () => {
    if (initialized) return;
    initialized = true;
    if (!targetWindow.YT?.Player) {
      resolveReady(undefined);
      return;
    }
    new targetWindow.YT.Player(element, {
      events: {
        onReady: (event) => resolveReady(event.target),
        onStateChange: () => undefined,
        onError: () => undefined,
        onAutoplayBlocked: () => undefined,
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
      resolveReady(undefined);
    }, { once: true });
    targetDocument.head.append(script);
  }
  return controller;
}

export function playerForTests(driver: YouTubeDriver | undefined): YouTubeOfficialPlayer {
  let elapsed = 0;
  return new YouTubeOfficialPlayer(
    Promise.resolve(driver),
    async (milliseconds) => { elapsed += milliseconds; },
    3_000,
    100,
    () => elapsed,
  );
}
