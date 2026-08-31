# WebMCP Video

WebMCP Video is a standalone, page-scoped example for finding and playing exact video moments.

It registers three top-level tools through `document.modelContext`:

1. `search_this_catalog` finds rights-cleared moments on the current page.
2. `get_moment_context` returns exact timing and evidence for one search result.
3. `play_moment` moves or cues the official YouTube player.

The repository makes no model calls. It has no backend and needs no secrets.

## Quick start

Use Node.js 22.23.1 and pnpm 10.31.0.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm verify:commit
pnpm dev
```

Open `http://127.0.0.1:5173/examples/plain-html/`.

The page still offers local controls when WebMCP is unavailable.

## The tool chain

Search returns an opaque, random reference with an exact start and end time.

The reference expires after five minutes. It is bound to one page mapping and one rights generation.

Context and playback each perform a fresh authorization check.

The browser never accepts page scope, video scope, provider scope, or a network endpoint from tool input.

Tool results expose no internal identifiers or media delivery locators. They include one public link for opening the selected moment.

## Truthful playback

`play_moment` returns one observed local state:

- `sought`: the loaded player reached the requested time.
- `cued`: the requested video and time are ready.
- `needs_user`: browser policy requires user action.
- `fallback`: playback was not proven.

New playback supersedes older playback. A superseded operation cannot publish stale success or stale audit evidence.

## Rights and assets

The fixture checks active and revoked states before playback and after asynchronous player work.

The build contains no video, image, audio, font, thumbnail, transcript file, or media segment.

See [ASSET-RIGHTS.md](ASSET-RIGHTS.md) for the complete ledger.

## Audit evidence

The page shows a `Local demo audit` record for the current browser session.

This record is not persistent. It is not production service audit evidence.

## Verification

`pnpm verify:commit` runs pinned-version checks, TypeScript, unit tests, build, Chromium tests, and release scans.

See [JUDGING.md](JUDGING.md) for exact review steps and clean-clone commands.

## Limits

Automated Chromium tests use a deterministic YouTube API driver. They prove browser behavior, not live provider availability.

A supported WebMCP host must still discover and invoke the tools before anyone claims supported-host proof.

## License

The code is available under Apache-2.0. Platform media remains subject to its owner permissions and YouTube terms.
