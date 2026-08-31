import { describe, expect, it } from "vitest";
import { ReferenceVault, isOpaqueMomentReference } from "#video/adapter/reference-vault";

function deterministicRandom() {
  let counter = 0;
  return (target: Uint8Array) => {
    target.fill(counter);
    counter += 1;
    return target;
  };
}

describe("opaque expiring references", () => {
  it("binds random references to one page without encoded details", () => {
    const vault = new ReferenceVault("page_mapping_one", () => 1_000, deterministicRandom(), 300_000);
    const issued = vault.issue("sensitive_fixture_key_46_seconds", 7);
    expect(isOpaqueMomentReference(issued.momentRef)).toBe(true);
    expect(issued.momentRef).not.toContain("sensitive");
    expect(issued.momentRef).not.toContain("46");
    expect(vault.resolve(issued.momentRef, "page_mapping_one")).toMatchObject({
      fixtureKey: "sensitive_fixture_key_46_seconds",
      rightsGeneration: 7,
    });
    expect(() => vault.resolve(issued.momentRef, "page_mapping_two")).toThrow("reference_denied");
  });

  it("fails closed at the exact expiry boundary", () => {
    let now = 10_000;
    const vault = new ReferenceVault("page_mapping_one", () => now, deterministicRandom(), 5_000);
    const issued = vault.issue("fixture_key", 0);
    now = 14_999;
    expect(() => vault.resolve(issued.momentRef, "page_mapping_one")).not.toThrow();
    now = 15_000;
    expect(() => vault.resolve(issued.momentRef, "page_mapping_one")).toThrow("reference_denied");
  });
});
