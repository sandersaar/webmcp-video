import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const forbiddenExtensions = new Set([".aac", ".gif", ".jpeg", ".jpg", ".m4a", ".m4v", ".mp3", ".mp4", ".ogg", ".png", ".svg", ".wav", ".webm", ".webp"]);
const files = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else files.push(path);
  }
}

await walk(dist);
for (const path of files) {
  if (forbiddenExtensions.has(extname(path).toLowerCase())) throw new Error(`External media bundled: ${relative(root, path)}`);
  if ((await stat(path)).size > 500_000) throw new Error(`Unexpected large bundle file: ${relative(root, path)}`);
  const text = await readFile(path, "utf8");
  if (/data:(?:audio|image|video)\//i.test(text)) throw new Error(`Embedded media found: ${relative(root, path)}`);
  if (/\.(?:m3u8|mpd|m4s)(?:[?"'\s]|$)/i.test(text)) throw new Error(`Media locator found: ${relative(root, path)}`);
}
process.stdout.write(`Bundle verification passed for ${files.length} files.\n`);
