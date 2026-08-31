import { readFile } from "node:fs/promises";

const registration = await readFile(new URL("../src/adapter/register-tools.ts", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../src/contracts/manifest.json", import.meta.url), "utf8"));
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
process.stdout.write("Tool surface verification passed.\n");
