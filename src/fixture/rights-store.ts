import { ReferenceDeniedError, ReferenceVault } from "#video/adapter/reference-vault";
import { officialMomentUrl } from "#video/adapter/results";
import type { FixtureCatalog, FixtureMoment, FixtureVideo, PlayAuthorization, RightsState } from "#video/adapter/types";

export class RightsDeniedError extends Error {
  readonly code = "rights_denied";
}

type FixtureEntry = Readonly<{ video: FixtureVideo; moment: FixtureMoment }>;

export class FixtureRightsStore {
  private readonly states = new Map<string, RightsState>();
  private readonly generations = new Map<string, number>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly entries = new Map<string, FixtureEntry>();

  constructor(
    private readonly fixture: FixtureCatalog,
    private readonly references: ReferenceVault,
    private readonly pageMapping: string,
  ) {
    if (fixture.page_mapping !== pageMapping) throw new Error("page_mapping_mismatch");
    for (const video of fixture.videos) {
      for (const moment of video.moments) {
        this.entries.set(moment.fixture_key, { video, moment });
        this.states.set(moment.fixture_key, moment.rights_state);
        this.generations.set(moment.fixture_key, 0);
        const controller = new AbortController();
        if (moment.rights_state !== "active" || video.rights_state !== "active") controller.abort("rights_denied");
        this.controllers.set(moment.fixture_key, controller);
      }
    }
  }

  activeEntries(): readonly FixtureEntry[] {
    return [...this.entries.values()].filter(({ video, moment }) =>
      video.rights_state === "active" && moment.rights_state === "active" &&
      this.states.get(moment.fixture_key) === "active");
  }

  issue(entry: FixtureEntry): Readonly<{ momentRef: string; expiresAt: string }> {
    if (!this.activeEntries().some((candidate) => candidate.moment.fixture_key === entry.moment.fixture_key)) {
      throw new RightsDeniedError("rights_denied");
    }
    return this.references.issue(entry.moment.fixture_key, this.generations.get(entry.moment.fixture_key) ?? 0);
  }

  setState(fixtureKey: string, state: RightsState): void {
    if (!this.entries.has(fixtureKey)) throw new RightsDeniedError("rights_denied");
    this.states.set(fixtureKey, state);
    this.generations.set(fixtureKey, (this.generations.get(fixtureKey) ?? 0) + 1);
    this.controllers.get(fixtureKey)?.abort("rights_changed");
    const controller = new AbortController();
    if (state !== "active") controller.abort("rights_denied");
    this.controllers.set(fixtureKey, controller);
  }

  revokeReference(momentRef: string): void {
    const authorized = this.authorize(momentRef);
    this.setState(authorized.moment.fixture_key, "revoked");
  }

  authorize(momentRef: string): Readonly<{
    video: FixtureVideo;
    moment: FixtureMoment;
    authorization: PlayAuthorization;
    rightsGeneration: number;
    revocationSignal: AbortSignal;
  }> {
    let reference;
    try {
      reference = this.references.resolve(momentRef, this.pageMapping);
    } catch (error) {
      if (error instanceof ReferenceDeniedError) throw new RightsDeniedError("rights_denied");
      throw error;
    }
    const entry = this.entries.get(reference.fixtureKey);
    const currentGeneration = this.generations.get(reference.fixtureKey) ?? -1;
    const controller = this.controllers.get(reference.fixtureKey);
    if (!entry || entry.video.rights_state !== "active" || entry.moment.rights_state !== "active" ||
        this.states.get(reference.fixtureKey) !== "active" || currentGeneration !== reference.rightsGeneration ||
        !controller || controller.signal.aborted) {
      throw new RightsDeniedError("rights_denied");
    }
    return {
      ...entry,
      rightsGeneration: currentGeneration,
      revocationSignal: controller.signal,
      authorization: {
        moment_ref: momentRef,
        expires_at: reference.expiresAt,
        title: entry.video.title,
        youtube_video_id: entry.video.youtube_video_id,
        requested_seconds: entry.moment.start_seconds,
        open_url: officialMomentUrl(entry.video.youtube_video_id, entry.moment.start_seconds),
      },
    };
  }

  assertAuthorizationActive(momentRef: string, rightsGeneration: number): void {
    const authorized = this.authorize(momentRef);
    if (authorized.rightsGeneration !== rightsGeneration) throw new RightsDeniedError("rights_denied");
  }
}
