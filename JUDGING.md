# Judge guide

## Five-minute local review

1. Confirm Node.js reports `v22.23.1`.
2. Confirm pnpm reports `10.31.0`.
3. Run the frozen installation and complete verification.
4. Start the local page.
5. Open `http://127.0.0.1:5173/examples/plain-html/`.

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm verify:commit
pnpm dev
```

Use the default `motorized exoskeleton` search. The result starts at 46 seconds.

Open its context. The evidence identifies the device and the following scene.

Play the moment. Confirm the page reports an observed local state and keeps the public open link.

## Supported WebMCP runtime

Open the same page in a supported top-level runtime.

Confirm discovery shows exactly these tools:

- `search_this_catalog`
- `get_moment_context`
- `play_moment`

Invoke them in that order. Reuse the returned opaque reference without editing it.

Supported-host discovery is separate from local automated proof.

## Browser evidence

Playwright runs real Chromium against the page.

The suite covers chaining, cueing, two revocation points, overlapping plays, missing runtime, autoplay restrictions, and stale suppression.

The suite injects a deterministic YouTube API driver. It does not contact or validate the live provider.

## Exact clean-clone commands

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

The repository also provides `pnpm verify:clean-clone` for the same gate.

## Evidence labels

- Unit proof validates isolated contracts and race behavior.
- Chromium proof validates local browser integration with a deterministic player driver.
- Manual provider proof requires the live official player.
- Supported-host proof requires observed host discovery and invocation.
- Local demo audit evidence is not production audit evidence.
