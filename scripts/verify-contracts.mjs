import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(root, "src/contracts/manifest.json"), "utf8"));
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const expected = ["search_this_catalog", "get_moment_context", "play_moment"];
if (manifest.contractVersion !== "1.0") throw new Error("Contract version must be 1.0.");
if (Object.keys(packageJson.dependencies ?? {}).length > 0) throw new Error("Runtime dependencies are not allowed.");
if (JSON.stringify(manifest.tools.map((tool) => tool.id)) !== JSON.stringify(expected)) {
  throw new Error("Manifest must contain exactly three tools in the approved order.");
}
for (const tool of manifest.tools) {
  for (const field of ["inputSchema", "resultSchema"]) {
    const path = join(root, "src/contracts", tool[field]);
    const schema = JSON.parse(await readFile(path, "utf8"));
    if (schema.type !== "object" || schema.additionalProperties !== false) {
      throw new Error(`Schema is not closed: ${tool[field]}`);
    }
  }
}
process.stdout.write("Contract verification passed.\n");
