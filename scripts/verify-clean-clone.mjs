import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
  cwd: sourceRoot,
  encoding: "utf8",
}).trim();
if (status) throw new Error("Clean-clone verification requires a clean tracked worktree.");

const cleanRoot = await mkdtemp(join(tmpdir(), "webmcp-video-clean-"));
const cloneRoot = join(cleanRoot, "repo");
try {
  execFileSync("git", ["clone", "--no-local", sourceRoot, cloneRoot], { stdio: "inherit" });
  const nodeVersion = execFileSync("node", ["--version"], { cwd: cloneRoot, encoding: "utf8" }).trim();
  const pnpmVersion = execFileSync("pnpm", ["--version"], { cwd: cloneRoot, encoding: "utf8" }).trim();
  if (nodeVersion !== "v22.23.1" || pnpmVersion !== "10.31.0") throw new Error("Clean clone has incorrect tool versions.");
  try {
    await readFile(join(cloneRoot, ".local", "source-provenance.json"), "utf8");
    throw new Error("Ignored provenance entered the clean clone.");
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  execFileSync("pnpm", ["install", "--frozen-lockfile"], { cwd: cloneRoot, stdio: "inherit" });
  execFileSync("pnpm", ["exec", "playwright", "install", "chromium"], { cwd: cloneRoot, stdio: "inherit" });
  execFileSync("pnpm", ["verify:commit"], { cwd: cloneRoot, stdio: "inherit" });
  const revision = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: cloneRoot, encoding: "utf8" }).trim();
  process.stdout.write(`Clean-clone verification passed at ${revision}.\n`);
} finally {
  await rm(cleanRoot, { recursive: true, force: true });
}
