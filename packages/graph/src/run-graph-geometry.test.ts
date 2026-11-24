import { describe, it, expect } from "vitest";
import { fitNodeLabel, nodeHeightFor, NODE_LABEL_CHARS } from "./run-graph-geometry";
import type { VisibleGraph, VisibleNode } from "./graph-view-model";

const node = (id: string, outcomes: readonly string[] = []): VisibleNode => ({
  id,
  type: "agent",
  outcomes,
  isEntry: false,
  isExit: false,
  isFail: false,
  hasProblem: false,
});

const graph = (over: Partial<VisibleGraph> = {}): VisibleGraph => ({ nodes: [], edges: [], ...over });

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

describe("nodeHeightFor", () => {
  it("uses the base height when no node lists outcomes", () => {
    expect(nodeHeightFor(graph({ nodes: [node("a")] }))).toEqual(48);
  });

  it("grows to fit the widest outcome list", () => {
    expect(nodeHeightFor(graph({ nodes: [node("a", ["success", "failed"]), node("b")] }))).toEqual(48 + 14 + 2 * 15);
  });
});
