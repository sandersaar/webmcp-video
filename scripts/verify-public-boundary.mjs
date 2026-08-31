import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skipped = new Set([".git", ".local", "dist", "node_modules", "playwright-report", "test-results"]);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const files = await walk(root);
const failures = [];
const internalName = ["agent", "cdn"].join("");
const internalCheckout = `${internalName}-base`;
const privateRevision = ["573b", "ed7b"].join("");
const unsafePatterns = [
  [/\/(?:Users|private\/tmp|home)\//, "absolute internal path"],
  [new RegExp(internalCheckout, "i"), "internal checkout name"],
  [new RegExp(privateRevision, "i"), "private source revision"],
  [/(?:authorization\s*:\s*["']bearer|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|AKIA[0-9A-Z]{16})/i, "credential"],
  [/(?:secret|password|access_token|api_key)\s*[:=]\s*["'][A-Za-z0-9_+\/-]{16,}["']/i, "credential assignment"],
  [/https?:\/\/[^\s"'<>]+[?&](?:expires|key|sig|signature|token)=/i, "signed URL"],
  [/https?:\/\/[^\s"'<>]+\.(?:m3u8|mpd|m4s|ts)(?:[?&#\s"'<>]|$)/i, "media delivery URL"],
];

for (const path of files) {
  const display = relative(root, path);
  const text = await readFile(path, "utf8");
  for (const [pattern, label] of unsafePatterns) {
    if (pattern.test(text)) failures.push(`${display}: ${label}`);
  }
  if (/\.(?:ts|js)$/.test(path) && /(?:\.innerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(|\beval\s*\(|new Function\s*\()/.test(text)) {
    failures.push(`${display}: unsafe browser sink`);
  }
}

let history = "";
try {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  if (tracked.some((path) => path.startsWith(".local/"))) failures.push("ignored provenance is tracked");
  history = execFileSync("git", ["log", "--all", "--format=fuller", "-p", "--no-ext-diff"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
} catch {
  history = "";
}
for (const [pattern, label] of unsafePatterns.slice(0, 3)) {
  if (pattern.test(history)) failures.push(`Git history: ${label}`);
}
if (failures.length > 0) throw new Error(`Public boundary failed:\n${failures.join("\n")}`);
process.stdout.write(`Public boundary verification passed for ${files.length} files.\n`);
