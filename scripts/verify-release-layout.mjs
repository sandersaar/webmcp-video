import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const expected = [
  ".github/workflows/ci.yml",
  ".gitignore",
  ".node-version",
  "ASSET-RIGHTS.md",
  "JUDGING.md",
  "LICENSE",
  "NOTICE",
  "README.md",
  "SECURITY.md",
  "examples/plain-html/index.html",
  "package.json",
  "playwright.config.ts",
  "pnpm-lock.yaml",
  "public/fixtures/rights-safe-catalog.v1.json",
  "public/page-tools.json",
  "scripts/verify-bundle.mjs",
  "scripts/verify-clean-clone.mjs",
  "scripts/verify-contracts.mjs",
  "scripts/verify-public-boundary.mjs",
  "scripts/verify-release-layout.mjs",
  "scripts/verify-tool-surface.mjs",
  "scripts/verify-versions.mjs",
  "src/adapter/handlers.ts",
  "src/adapter/lifecycle.ts",
  "src/adapter/page-config.ts",
  "src/adapter/player.ts",
  "src/adapter/reference-vault.ts",
  "src/adapter/register-tools.ts",
  "src/adapter/results.ts",
  "src/adapter/types.ts",
  "src/contracts/manifest.json",
  "src/contracts/schemas/get_moment_context.input.schema.json",
  "src/contracts/schemas/get_moment_context.result.schema.json",
  "src/contracts/schemas/play_moment.input.schema.json",
  "src/contracts/schemas/play_moment.result.schema.json",
  "src/contracts/schemas/search_this_catalog.input.schema.json",
  "src/contracts/schemas/search_this_catalog.result.schema.json",
  "src/demo/audit-panel.ts",
  "src/demo/flow-panel.ts",
  "src/demo/main.ts",
  "src/demo/styles.css",
  "src/fixture/load-fixture.ts",
  "src/fixture/rights-store.ts",
  "src/index.ts",
  "tests/browser/runtime-fixture.ts",
  "tests/browser/webmcp-video.spec.ts",
  "tests/fixture-validation.test.ts",
  "tests/overlapping-play.test.ts",
  "tests/page-scope.test.ts",
  "tests/player-state.test.ts",
  "tests/public-boundary.test.ts",
  "tests/reference-expiry.test.ts",
  "tests/registration.test.ts",
  "tests/result-safety.test.ts",
  "tests/rights-revocation.test.ts",
  "tests/tool-flow.test.ts",
  "tsconfig.json",
  "vercel.json",
  "vite.config.ts",
].sort();

const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean).sort();
if (JSON.stringify(tracked) !== JSON.stringify(expected)) {
  const missing = expected.filter((path) => !tracked.includes(path));
  const extra = tracked.filter((path) => !expected.includes(path));
  throw new Error(`Release layout drift. Missing: ${missing.join(", ") || "none"}. Extra: ${extra.join(", ") || "none"}.`);
}
process.stdout.write(`Release layout verification passed for ${tracked.length} tracked files.\n`);
