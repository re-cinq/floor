import { describe, it, expect } from "vitest";
import { fitNodeLabel, NODE_LABEL_CHARS } from "./run-graph-geometry";

describe("fitNodeLabel", () => {
  it("clips a label longer than the box to an ellipsis at the budget", () => {
    const clipped = fitNodeLabel("x".repeat(NODE_LABEL_CHARS + 10));

    expect({ clipped, length: clipped.length }).toEqual({ clipped: `${"x".repeat(NODE_LABEL_CHARS - 1)}…`, length: NODE_LABEL_CHARS });
  });

  it("drops the space before an ellipsis that lands on a word break", () => {
    expect(fitNodeLabel("abcd efghij", 6)).toEqual("abcd…");
  });

  it("leaves a label exactly at the budget unclipped", () => {
    const exact = "y".repeat(NODE_LABEL_CHARS);

    expect(fitNodeLabel(exact)).toEqual(exact);
  });
});
