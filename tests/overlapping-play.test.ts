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
  it("supersedes the older operation", async () => {
    let seconds = 0;
    const driver = {
      getCurrentTime: () => seconds,
      getPlayerState: () => 1,
      getVideoData: () => ({ video_id: "t82C_EYja18" }),
      seekTo: (next: number) => { seconds = next; },
      cueVideoById: () => undefined,
    };
    let releaseDelay: () => void = () => undefined;
    const firstDelay = new Promise<void>((resolve) => { releaseDelay = resolve; });
    let delayCount = 0;
    const player = new YouTubeOfficialPlayer(Promise.resolve(driver), async () => {
      delayCount += 1;
      if (delayCount === 1) await firstDelay;
    });

    const first = player.playMoment({ ...baseAuthorization, requested_seconds: 12 }, new AbortController().signal);
    await Promise.resolve();
    const second = player.playMoment(baseAuthorization, new AbortController().signal);
    releaseDelay();
    await expect(first).rejects.toBeInstanceOf(SupersededPlayError);
    await expect(second).resolves.toMatchObject({ status: "sought", observed_seconds: 46 });
  });
});
