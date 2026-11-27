import { describe, expect, it } from "vitest";
import { resolveNeeds } from "./resolve.js";
import type { Item, NeedSpec } from "./types.js";

describe("resolveNeeds", () => {
  it("names constructor as missing when the bag is empty", () => {
    expect(resolveNeeds([{ name: "constructor", kind: "value" }], undefined, {})).toEqual({
      needs: {},
      missing: ["constructor"],
    });
  });
});

describe("resolveNeeds with items in the bag", () => {
  it("returns /blobs/abc123 for file need plan and 'ship it' for value need verdict", () => {
    const specs: NeedSpec[] = [
      { name: "plan", kind: "file" },
      { name: "verdict", kind: "value" },
    ];
    const bag: Record<string, Item> = {
      plan: { kind: "file", ref: "abc123", by: "visit-1" },
      verdict: { kind: "value", ref: "ship it", by: "visit-1" },
    };

    expect(resolveNeeds(specs, undefined, bag)).toEqual({
      needs: { plan: "/blobs/abc123", verdict: "ship it" },
      missing: [],
    });
  });
});
