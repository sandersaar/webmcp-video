import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const registration = await readFile(join(root, "src/adapter/register-tools.ts"), "utf8");
const manifest = JSON.parse(await readFile(join(root, "src/contracts/manifest.json"), "utf8"));
const expected = ["search_this_catalog", "get_moment_context", "play_moment"];
const unsupportedField = ["output", "Schema"].join("");
const retiredTool = ["ask", "this", "video"].join("_");

if (JSON.stringify(manifest.tools.map((tool) => tool.id)) !== JSON.stringify(expected)) {
  throw new Error("Unexpected public tool surface.");
}
if (registration.includes(unsupportedField)) throw new Error("Unsupported registration field found.");
if (registration.includes(retiredTool)) throw new Error("Retired tool found.");
if (!registration.includes("await modelContext.registerTool")) throw new Error("Registration is not awaited.");
if (!registration.includes("input.document.modelContext")) throw new Error("Top-level document registration is missing.");
if (/navigator\s*[.[]\s*['\"]?modelContext/.test(registration)) throw new Error("Legacy registration path found.");

const forbiddenResultKeys = new Set([
  "fixture_key",
  "manifest_url",
  "provider_id",
  "segment_url",
  "storage_url",
  "stream_url",
  "youtube_video_id",
]);
function inspectSchema(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(inspectSchema);
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenResultKeys.has(key)) throw new Error(`Raw locator field found: ${key}`);
    inspectSchema(nested);
  }
}
for (const tool of manifest.tools) {
  inspectSchema(JSON.parse(await readFile(join(root, "src/contracts", tool.resultSchema), "utf8")));
}

async function builtText(directory) {
  let text = "";
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    text += entry.isDirectory() ? await builtText(path) : await readFile(path, "utf8");
  }
  return text;
}
const output = await builtText(join(root, "dist"));
for (const toolId of expected) {
  if (!output.includes(toolId)) throw new Error(`Built output omits tool: ${toolId}`);
}
if (output.includes(unsupportedField) || output.includes(retiredTool)) throw new Error("Built tool surface contains a forbidden field.");
process.stdout.write("Tool surface verification passed.\n");
