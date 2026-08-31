import { describe, expect, it, vi } from "vitest";
import { YouTubeOfficialPlayer } from "#video/adapter/player";

const authorization = {
  moment_ref: "wmv_AAAAAAAAAAAAAAAAAAAAAA",
  expires_at: "2030-01-01T00:00:00.000Z",
  title: "Example",
  youtube_video_id: "t82C_EYja18",
  requested_seconds: 46,
  open_url: "https://www.youtube.com/watch?v=t82C_EYja18&t=46s",
};

function driver(input: { state: number; videoId?: string; seconds?: number }) {
  let state = input.state;
  let videoId = input.videoId ?? authorization.youtube_video_id;
  let seconds = input.seconds ?? authorization.requested_seconds;
  return {
    getCurrentTime: () => seconds,
    getPlayerState: () => state,
    getVideoData: () => ({ video_id: videoId }),
    seekTo: vi.fn((next: number) => { seconds = next; }),
    cueVideoById: vi.fn((next: { videoId: string; startSeconds: number }) => {
      videoId = next.videoId;
      seconds = next.startSeconds;
      state = 5;
    }),
  };
}

function clockedPlayer(
  fake: ReturnType<typeof driver>,
  input: Readonly<{ timeout?: number; guard?: number; onDelay?: (elapsed: number) => void }> = {},
) {
  let elapsed = 0;
  const player = new YouTubeOfficialPlayer(
    Promise.resolve(fake),
    async (milliseconds) => {
      elapsed += milliseconds;
      input.onDelay?.(elapsed);
    },
    input.timeout ?? 400,
    input.guard ?? 100,
    () => elapsed,
  );
  return { player, elapsed: () => elapsed };
}

describe("truthful player states", () => {
  it.each([
    [1, "sought", "playing"],
    [2, "sought", "paused"],
    [3, "sought", "buffering"],
  ])("observes loaded state %s after stable direct reads", async (state, status, playerState) => {
    const fake = driver({ state: Number(state), seconds: 0 });
    const test = clockedPlayer(fake);
    await expect(test.player.playMoment(authorization, new AbortController().signal))
      .resolves.toMatchObject({ status, player_state: playerState, observed_seconds: 46 });
    expect(test.elapsed()).toBeGreaterThanOrEqual(100);
    expect(fake.seekTo).toHaveBeenCalledOnce();
  });

  it("cues a cold or different video after stable direct reads", async () => {
    const fake = driver({ state: -1, videoId: "j_w8EvCJ6mU", seconds: 0 });
    const test = clockedPlayer(fake);
    await expect(test.player.playMoment(authorization, new AbortController().signal))
      .resolves.toEqual({ status: "cued", observed_seconds: null, player_state: "cued" });
    expect(test.elapsed()).toBeGreaterThanOrEqual(100);
    expect(fake.cueVideoById).toHaveBeenCalledWith({ videoId: authorization.youtube_video_id, startSeconds: 46 });
  });

  it("uses one navigation command without changing user playback", async () => {
    const fake = Object.assign(driver({ state: 1, seconds: 0 }), {
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
    });
    const test = clockedPlayer(fake);
    await expect(test.player.playMoment(authorization, new AbortController().signal))
      .resolves.toMatchObject({ status: "sought" });
    expect(fake.seekTo).toHaveBeenCalledOnce();
    expect(fake.cueVideoById).not.toHaveBeenCalled();
    expect(fake.playVideo).not.toHaveBeenCalled();
    expect(fake.pauseVideo).not.toHaveBeenCalled();
  });

  it("returns fallback without a ready driver", async () => {
    const player = new YouTubeOfficialPlayer(Promise.resolve(undefined), async () => undefined, 400, 100, () => 0);
    await expect(player.playMoment(authorization, new AbortController().signal))
      .resolves.toEqual({ status: "fallback", observed_seconds: null, player_state: "unknown" });
  });

  it("waits through the full 100ms settlement guard after two matching samples", async () => {
    const fake = driver({ state: 2, seconds: 0 });
    const test = clockedPlayer(fake, { guard: 100, timeout: 300 });
    await expect(test.player.playMoment(authorization, new AbortController().signal))
      .resolves.toMatchObject({ status: "sought", observed_seconds: 46 });
    expect(test.elapsed()).toBe(100);
  });

  it("falls back when the one operation deadline cannot contain settlement", async () => {
    const fake = driver({ state: 2, seconds: 0 });
    const test = clockedPlayer(fake, { guard: 100, timeout: 100 });
    await expect(test.player.playMoment(authorization, new AbortController().signal))
      .resolves.toEqual({ status: "fallback", observed_seconds: null, player_state: "unknown" });
    expect(test.elapsed()).toBe(100);
    expect(fake.seekTo).toHaveBeenCalledOnce();
  });

  it("uses the same deadline while waiting for readiness", async () => {
    let elapsed = 0;
    const fake = driver({ state: 2, seconds: 0 });
    const player = new YouTubeOfficialPlayer(
      new Promise(() => undefined),
      async (milliseconds) => { elapsed += milliseconds; },
      125,
      100,
      () => elapsed,
      (callback, milliseconds) => {
        queueMicrotask(() => {
          elapsed += milliseconds;
          callback();
        });
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
      () => undefined,
    );
    await expect(player.playMoment(authorization, new AbortController().signal))
      .resolves.toEqual({ status: "fallback", observed_seconds: null, player_state: "unknown" });
    expect(elapsed).toBe(125);
    expect(fake.seekTo).not.toHaveBeenCalled();
  });

  it("corrects a late old mutation before the first matching read", async () => {
    const fake = driver({ state: -1, videoId: "old_video", seconds: 0 });
    fake.cueVideoById.mockImplementationOnce(() => undefined);
    const test = clockedPlayer(fake, { timeout: 400 });
    await expect(test.player.playMoment(authorization, new AbortController().signal))
      .resolves.toMatchObject({ status: "cued" });
    expect(fake.cueVideoById).toHaveBeenCalledTimes(2);
    expect(test.elapsed()).toBeGreaterThanOrEqual(200);
  });

  it("resets settlement after a late old mutation following the first match", async () => {
    const fake = driver({ state: -1, videoId: "old_video", seconds: 0 });
    const test = clockedPlayer(fake, {
      timeout: 400,
      onDelay: (elapsed) => {
        if (elapsed === 25) fake.cueVideoById({ videoId: "old_video", startSeconds: 7 });
      },
    });
    await expect(test.player.playMoment(authorization, new AbortController().signal))
      .resolves.toMatchObject({ status: "cued" });
    expect(fake.cueVideoById).toHaveBeenCalledTimes(3);
    expect(test.elapsed()).toBeGreaterThanOrEqual(200);
  });

  it("falls back after the initial command and two corrections", async () => {
    const fake = driver({ state: 2, seconds: 0 });
    fake.seekTo.mockImplementation(() => undefined);
    const test = clockedPlayer(fake, { timeout: 350 });
    await expect(test.player.playMoment(authorization, new AbortController().signal))
      .resolves.toEqual({ status: "fallback", observed_seconds: null, player_state: "unknown" });
    expect(fake.seekTo).toHaveBeenCalledTimes(3);
    expect(test.elapsed()).toBe(350);
  });

  it("re-reads the video before correction and uses cue for the authorized video", async () => {
    let videoId = authorization.youtube_video_id;
    let seconds = 0;
    let state = 2;
    const fake = {
      getCurrentTime: () => seconds,
      getPlayerState: () => state,
      getVideoData: () => ({ video_id: videoId }),
      seekTo: vi.fn(() => {
        videoId = "j_w8EvCJ6mU";
        seconds = 0;
        state = -1;
      }),
      cueVideoById: vi.fn(({ videoId: nextVideoId, startSeconds }: { videoId: string; startSeconds: number }) => {
        videoId = nextVideoId;
        seconds = startSeconds;
        state = 5;
      }),
    };
    let elapsed = 0;
    const player = new YouTubeOfficialPlayer(Promise.resolve(fake), async (milliseconds) => { elapsed += milliseconds; }, 400, 100, () => elapsed);
    await expect(player.playMoment(authorization, new AbortController().signal))
      .resolves.toEqual({ status: "cued", observed_seconds: null, player_state: "cued" });
    expect(fake.seekTo).toHaveBeenCalledOnce();
    expect(fake.cueVideoById).toHaveBeenCalledWith({ videoId: authorization.youtube_video_id, startSeconds: 46 });
  });
});
