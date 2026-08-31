import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("release boundaries", () => {
  it.each([
    ["public", "scripts/verify-public-boundary.mjs", "Public boundary verification passed"],
    ["contracts", "scripts/verify-contracts.mjs", "Contract verification passed"],
  ])("passes the %s verifier", (_name, script, expected) => {
    const output = execFileSync(process.execPath, [script], { encoding: "utf8" });
    expect(output).toContain(expected);
  });
});
