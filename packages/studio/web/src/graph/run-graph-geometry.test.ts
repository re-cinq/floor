import { describe, it, expect } from "vitest";
import { fitNodeLabel, nodeHeightFor, toLayoutDefinition, NODE_LABEL_CHARS } from "./run-graph-geometry";
import type { VisibleGraph, VisibleNode } from "./graph-view-model";
import type { AssemblyLineDefinition } from "./assembly-line-definition";

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

    expect(clipped).toEqual(`${"x".repeat(NODE_LABEL_CHARS - 1)}…`);
    expect(clipped.length).toEqual(NODE_LABEL_CHARS);
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

describe("toLayoutDefinition", () => {
  it("takes the definition's own name, entry and exit, and the graph's nodes and hops as plain always edges", () => {
    const definition: AssemblyLineDefinition = { name: "code-review", description: "", version: 1, entry: "review", exit: "done", nodes: [], edges: [] };
    const hop = { from: "review", to: "done", tone: "ok" as const, label: "success", branching: false };

    expect(toLayoutDefinition(graph({ nodes: [node("review")], edges: [hop] }), definition)).toEqual({
      name: "code-review",
      description: "",
      version: 1,
      entry: "review",
      exit: "done",
      nodes: [{ id: "review", type: "agent" }],
      edges: [{ from: "review", to: "done", on: "always" }],
    });
  });
});
