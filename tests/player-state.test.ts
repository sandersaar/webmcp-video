import { describe, expect, it, vi } from "vitest";
import { playerForTests } from "#video/adapter/player";

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
  let videoId = input.videoId ?? "t82C_EYja18";
  let seconds = input.seconds ?? 46;
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

describe("truthful player states", () => {
  it.each([
    [1, "sought", "playing"],
    [2, "sought", "paused"],
    [3, "sought", "buffering"],
  ])("observes loaded state %s", async (state, status, playerState) => {
    const fake = driver({ state: Number(state), seconds: 0 });
    await expect(playerForTests(fake).playMoment(authorization, new AbortController().signal))
      .resolves.toMatchObject({ status, player_state: playerState, observed_seconds: 46 });
  });

  it("cues a cold or different video", async () => {
    const fake = driver({ state: -1, videoId: "j_w8EvCJ6mU", seconds: 0 });
    await expect(playerForTests(fake).playMoment(authorization, new AbortController().signal))
      .resolves.toEqual({ status: "cued", observed_seconds: null, player_state: "cued" });
    expect(fake.cueVideoById).toHaveBeenCalledWith({ videoId: "t82C_EYja18", startSeconds: 46 });
  });

  it("returns fallback without a ready driver", async () => {
    await expect(playerForTests(undefined).playMoment(authorization, new AbortController().signal))
      .resolves.toEqual({ status: "fallback", observed_seconds: null, player_state: "unknown" });
  });
});
