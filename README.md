# WebMCP Video

WebMCP Video is a small working example. An AI can search video moments, explain one, and get the official YouTube player ready there.

Try the live demo: [webmcp-video.vercel.app](https://webmcp-video.vercel.app)

The page gives an AI three tools through `document.modelContext`:

1. `search_this_catalog` finds matching moments and returns a `moment_ref` for each result.
2. `get_moment_context` explains one result. It does not change the player.
3. `play_moment` gets the official player ready at that moment.

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

The page still has local controls when WebMCP is unavailable.

## How the tools work

Search returns a random, short-lived reference with an exact start and end time.

The reference expires after five minutes. It only works on the page and with the current rights setting that created it.

Context and playback check the rights setting again before they act.

The browser cannot choose the creator, video, player service, or API endpoint. Those details come from fixed page settings.

Tool results include no raw stream URLs. They include one public link that opens the selected moment.

## Playback reports only what the browser sees

`play_moment` returns one local player state:

- `sought`: the loaded player reached the requested time.
- `cued`: the requested video and time are ready.
- `fallback`: the page could not prove the result.

The result comes from direct video ID, time, and player-state checks. Player events only tell the page when to check again.

A new playback request cancels an older one. Only the newest request can update the player or report success.

Each request has one three-second limit. Success needs two matching checks at least 100 milliseconds apart. The page sends one first command and at most two corrections. It never starts or pauses playback for the user.

## Rights and assets

The demo checks active and revoked states before playback and after player work.

The build contains no video, image, audio, font, thumbnail, transcript, or media file.

See [ASSET-RIGHTS.md](ASSET-RIGHTS.md) for the complete list.

## Audit record

The page shows a `Local demo audit` record for the current browser session.

This record is not stored. It is not a production audit record.

## Verification

Search and context results stay within 1,500 characters. Playback results stay within 1,200 characters.

`pnpm verify:commit` checks pinned versions, types, unit tests, the build, Chromium tests, and release files.

See [JUDGING.md](JUDGING.md) for the exact review steps and clean-clone commands.

## Limits

Automated Chromium tests use a controlled YouTube player so each run is repeatable. They do not prove that YouTube will always be available.

A supported WebMCP browser must still discover and call the three tools.

## License

The code uses the Apache-2.0 license. The linked videos remain subject to their owners' permissions and YouTube's terms.
