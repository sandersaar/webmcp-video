# Judge guide

## Fast live review

Open [webmcp-video.vercel.app](https://webmcp-video.vercel.app) in ChatGPT's in-app browser or another supported WebMCP browser.

Use this prompt:

```text
Use only this page's Site Tools.

Search this catalog for "motorized exoskeleton" with limit 1.
Use the returned moment_ref to get the moment context.
Then use the same moment_ref to play the moment.

Report each tool name and result. Do not answer from visible page text alone.
```

The result starts at 46 seconds. The context identifies the device and the next scene. The player should report `cued` or `sought`. Press play in the official player to watch it.

## Expected tools

The page must show exactly these tools:

- `search_this_catalog`
- `get_moment_context`
- `play_moment`

Call them in that order. Pass the returned `moment_ref` to the next tool without changing it.

## Five-minute local review

Use Node.js 22.23.1 and pnpm 10.31.0.

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm verify:commit
pnpm dev
```

Open `http://127.0.0.1:5173/examples/plain-html/`.

Use the default `motorized exoskeleton` search. Open its context, then play the moment.

## What the browser tests cover

Playwright runs Chromium against the built page.

The tests cover the three-tool chain, player movement, one three-second limit, stable player checks, late events, revoked rights, overlapping requests, missing WebMCP support, and old requests that finish late.

The tests use a controlled YouTube player. They do not contact or test the live YouTube service.

## Clean-clone check

Run these commands from the repository root after committing all intended files:

```sh
clean_root="$(mktemp -d "${TMPDIR:-/tmp}/webmcp-video-clean.XXXXXX")"
trap 'rm -rf "$clean_root"' EXIT
git clone --no-local "$PWD" "$clean_root/repo"
(
  cd "$clean_root/repo"
  test "$(node --version)" = "v22.23.1"
  test "$(pnpm --version)" = "10.31.0"
  pnpm install --frozen-lockfile
  pnpm exec playwright install chromium
  pnpm verify:commit
)
```

The repository also provides `pnpm verify:clean-clone`.

## What each test proves

- Unit tests check one function or rule at a time.
- Chromium tests check the page with a controlled player.
- Live player testing checks the official YouTube player.
- Supported-browser testing checks real tool discovery and calls.
- The local demo audit is not a stored production audit record.
