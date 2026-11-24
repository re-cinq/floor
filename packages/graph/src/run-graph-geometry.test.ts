import { describe, expect, it } from "vitest";
import { cardWidthOf } from "./run-graph-geometry";

describe("cardWidthOf", () => {
  it("returns 216 for Review and 263 for a 31-character title", () => {
    expect([cardWidthOf("Review"), cardWidthOf("x".repeat(31))]).toEqual([216, 263]);
  });

  it("returns 263 for a short title with a 31-character subtitle", () => {
    expect(cardWidthOf("A", "x".repeat(31))).toEqual(263);
  });
});
