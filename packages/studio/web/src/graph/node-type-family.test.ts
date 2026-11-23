import { describe, it, expect } from "vitest";
import { typeFamilyOf } from "./node-type-family";

describe("typeFamilyOf", () => {
  it.each([
    ["agent", "agent"],
    ["service", "service"],
    ["human", "person"],
    ["marker", "marker"],
  ] as const)("files a %s node under %s", (nodeType, family) => {
    expect(typeFamilyOf(nodeType)).toBe(family);
  });

  it("files a node with no type under marker", () => {
    expect(typeFamilyOf(undefined)).toBe("marker");
  });
});
