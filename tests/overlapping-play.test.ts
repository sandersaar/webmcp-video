import { describe, expect, it } from "vitest";
import { SupersededPlayError, YouTubeOfficialPlayer } from "#video/adapter/player";

const baseAuthorization = {
  moment_ref: "wmv_AAAAAAAAAAAAAAAAAAAAAA",
  expires_at: "2030-01-01T00:00:00.000Z",
  title: "Example",
  youtube_video_id: "t82C_EYja18",
  requested_seconds: 46,
  open_url: "https://www.youtube.com/watch?v=t82C_EYja18&t=46s",
};

describe("overlapping playback", () => {
  it.each([
    ["same target", baseAuthorization.youtube_video_id, 46],
    ["same video at a different time", baseAuthorization.youtube_video_id, 52],
    ["different video", "j_w8EvCJ6mU", 120],
  ])("supersedes the older operation for %s", async (_case, videoId, requestedSeconds) => {
    let seconds = 0;
    let currentVideoId = baseAuthorization.youtube_video_id;
    let state = 1;
    const driver = {
      getCurrentTime: () => seconds,
      getPlayerState: () => state,
      getVideoData: () => ({ video_id: currentVideoId }),
      seekTo: (next: number) => { seconds = next; },
      cueVideoById: ({ videoId: nextVideoId, startSeconds }: { videoId: string; startSeconds: number }) => {
        currentVideoId = nextVideoId;
        seconds = startSeconds;
        state = 5;
      },
    };
    let releaseDelay: () => void = () => undefined;
    const firstDelay = new Promise<void>((resolve) => { releaseDelay = resolve; });
    let delayCount = 0;
    const player = new YouTubeOfficialPlayer(Promise.resolve(driver), async () => {
      delayCount += 1;
      if (delayCount === 1) await firstDelay;
    }, 3_000, 0);

    const first = player.playMoment({ ...baseAuthorization, requested_seconds: 12 }, new AbortController().signal);
    await Promise.resolve();
    const second = player.playMoment({ ...baseAuthorization, youtube_video_id: videoId, requested_seconds: requestedSeconds }, new AbortController().signal);
    releaseDelay();
    await expect(first).rejects.toBeInstanceOf(SupersededPlayError);
    await expect(second).resolves.toMatchObject({
      status: videoId === baseAuthorization.youtube_video_id ? "sought" : "cued",
      observed_seconds: videoId === baseAuthorization.youtube_video_id ? requestedSeconds : null,
    });
  });

  it("cleans up a cancelled operation before a third call", async () => {
    let seconds = 0;
    const driver = {
      getCurrentTime: () => seconds,
      getPlayerState: () => 1,
      getVideoData: () => ({ video_id: baseAuthorization.youtube_video_id }),
      seekTo: (next: number) => { seconds = next; },
      cueVideoById: () => undefined,
    };
    const player = new YouTubeOfficialPlayer(Promise.resolve(driver), async () => undefined, 3_000, 0);
    const first = player.playMoment({ ...baseAuthorization, requested_seconds: 12 }, new AbortController().signal);
    const second = player.playMoment({ ...baseAuthorization, requested_seconds: 24 }, new AbortController().signal);
    await expect(first).rejects.toBeInstanceOf(SupersededPlayError);
    await expect(second).resolves.toMatchObject({ status: "sought", observed_seconds: 24 });
    await expect(player.playMoment(baseAuthorization, new AbortController().signal))
      .resolves.toMatchObject({ status: "sought", observed_seconds: 46 });
  });
});
