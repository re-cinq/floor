import { describe, it, expect } from "vitest";
import { deriveVisibleGraph, outcomeTone } from "./graph-view-model";
import { codeReviewDefinition, implementationDefinition } from "./definition.fixtures";

describe("outcomeTone", () => {
  it("maps success to ok, changes_requested to warn, failed to err", () => {
    expect([
      outcomeTone("success"),
      outcomeTone("changes_requested"),
      outcomeTone("failed"),
      outcomeTone("review-failed"),
      outcomeTone("always"),
    ]).toEqual(["ok", "warn", "err", "err", "neutral"]);
  });
});

describe("deriveVisibleGraph", () => {
  it("draws nothing for a line that is not there", () => {
    expect(deriveVisibleGraph(null)).toEqual({ nodes: [], edges: [] });
  });

  it("renders one connector and lists the outcomes in the source node when all lead to one step", () => {
    const graph = deriveVisibleGraph(codeReviewDefinition);
    const [review] = graph.nodes;

    expect({ connectors: graph.edges, outcomes: review.outcomes }).toEqual({
      connectors: [{ from: "review", to: "done", tone: "neutral", label: "success, changes_requested, failed", branching: false }],
      outcomes: ["success", "changes_requested", "failed"],
    });
  });

  it("renders separate branches when outcomes lead to different steps", () => {
    const fromReview = deriveVisibleGraph(implementationDefinition).edges.filter((edge) => edge.from === "review");

    expect(fromReview).toEqual([
      { from: "review", to: "retrospective", tone: "neutral", label: "success, failed", branching: true },
      { from: "review", to: "address", tone: "warn", label: "changes_requested (max 2)", branching: true },
    ]);
  });

  it("marks the entry, the exit and the fail node of the line", () => {
    const line = { ...codeReviewDefinition, fail: "done" };

    expect(deriveVisibleGraph(line).nodes.map(({ id, isEntry, isExit, isFail }) => ({ id, isEntry, isExit, isFail }))).toEqual([
      { id: "review", isEntry: true, isExit: false, isFail: false },
      { id: "done", isEntry: false, isExit: true, isFail: true },
    ]);
  });

  it("carries the fanout, the outside start and the problem flag of a node", () => {
    const line = {
      ...codeReviewDefinition,
      nodes: [{ id: "review", type: "agent" as const, fanout: { over: "files", to: "done" }, outsideStart: "pr.opened", hasProblem: true }, codeReviewDefinition.nodes[1]],
    };

    expect(deriveVisibleGraph(line).nodes[0]).toMatchObject({ fanout: { over: "files", to: "done" }, outsideStart: "pr.opened", hasProblem: true });
  });
});
