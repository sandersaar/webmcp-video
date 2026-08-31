import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const nodeVersion = process.version.slice(1);
const pnpmVersion = execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim();

if (nodeVersion !== "22.23.1") throw new Error(`Expected Node 22.23.1, received ${nodeVersion}.`);
if (pnpmVersion !== "10.31.0") throw new Error(`Expected pnpm 10.31.0, received ${pnpmVersion}.`);
if (packageJson.packageManager !== "pnpm@10.31.0") throw new Error("packageManager is not pinned.");
if (packageJson.engines?.node !== "22.23.1" || packageJson.engines?.pnpm !== "10.31.0") {
  throw new Error("Package engines are not pinned.");
}
process.stdout.write("Version verification passed.\n");
