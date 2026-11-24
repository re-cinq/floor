import { describe, expect, it } from "vitest";
import { resolveNeeds } from "./resolve.js";
import type { Item, NeedSpec } from "./types.js";

function verdictBag(by: string): Record<string, Item> {
  return { verdict: { kind: "value", ref: "approve", by } };
}

describe("resolveNeeds with a fresh need", () => {
  it.each([
    {
      optional: true,
      outcome: "leaves out an optional",
      expected: { needs: {}, missing: [] },
    },
    {
      optional: false,
      outcome: "reports as missing a required",
      expected: { needs: {}, missing: ["verdict (not produced since a person last acted)"] },
    },
  ])("$outcome fresh verdict produced by visit-1 when a person acted at visit-2", ({ optional, expected }) => {
    const spec: NeedSpec = { name: "verdict", kind: "value", fresh: true, optional };

    expect(resolveNeeds([spec], undefined, verdictBag("visit-1"), new Set(["visit-2"]))).toEqual(expected);
  });

  it("fills a fresh verdict produced by visit-2 when a person acted at visit-2", () => {
    const spec: NeedSpec = { name: "verdict", kind: "value", fresh: true };

    expect(resolveNeeds([spec], undefined, verdictBag("visit-2"), new Set(["visit-2"]))).toEqual({
      needs: { verdict: "approve" },
      missing: [],
    });
  });

  it("fills a fresh verdict produced by pr.opened when nobody has acted", () => {
    const spec: NeedSpec = { name: "verdict", kind: "value", fresh: true };

    expect(resolveNeeds([spec], undefined, verdictBag("pr.opened"))).toEqual({
      needs: { verdict: "approve" },
      missing: [],
    });
  });

  it("fills a verdict without fresh produced by visit-1 when a person acted at visit-2", () => {
    const spec: NeedSpec = { name: "verdict", kind: "value" };

    expect(resolveNeeds([spec], undefined, verdictBag("visit-1"), new Set(["visit-2"]))).toEqual({
      needs: { verdict: "approve" },
      missing: [],
    });
  });
});
