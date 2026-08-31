import { describe, expect, it } from "vitest";
import fixtureJson from "../public/fixtures/rights-safe-catalog.v1.json";
import { parseFixture } from "#video/fixture/load-fixture";

describe("fixture validation", () => {
  it("accepts the reviewed fixture", () => {
    expect(parseFixture(fixtureJson).videos).toHaveLength(2);
  });

  it("rejects unknown fields and duplicate keys", () => {
    expect(() => parseFixture({ ...fixtureJson, endpoint: "unexpected" })).toThrow("invalid_fixture");
    const duplicate = structuredClone(fixtureJson);
    duplicate.videos[1]!.moments[0]!.fixture_key = duplicate.videos[0]!.moments[0]!.fixture_key;
    expect(() => parseFixture(duplicate)).toThrow("duplicate_fixture_key");
  });
});
