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

  it("lists the outcomes in the source node when all lead to one step", () => {
    const [review] = deriveVisibleGraph(codeReviewDefinition).nodes;

    expect(review.outcomes).toEqual(["success", "changes_requested", "failed"]);
  });

  it("draws one toned connector per outcome, in definition order, when all lead to one step", () => {
    expect(deriveVisibleGraph(codeReviewDefinition).edges).toEqual([
      { from: "review", to: "done", on: "success", tone: "ok", label: "success", branching: false },
      { from: "review", to: "done", on: "changes_requested", tone: "warn", label: "changes_requested", branching: false },
      { from: "review", to: "done", on: "failed", tone: "err", label: "failed", branching: false },
    ]);
  });

  it("renders separate branches when outcomes lead to different steps", () => {
    const fromReview = deriveVisibleGraph(implementationDefinition).edges.filter((edge) => edge.from === "review");

    expect(fromReview).toEqual([
      { from: "review", to: "retrospective", on: "success", tone: "ok", label: "success", branching: true },
      { from: "review", to: "address", on: "changes_requested", tone: "warn", label: "changes_requested (max 2)", branching: true },
      { from: "review", to: "retrospective", on: "failed", tone: "err", label: "failed", branching: true },
    ]);
  });

  it.each([
    { label: "changes_requested (max 1 unattended)", limitNames: "only unattendedMax 1", limits: { iterationMax: undefined, unattendedMax: 1 } },
    { label: "changes_requested (max 2, max 1 unattended)", limitNames: "iterationMax 2 and unattendedMax 1", limits: { unattendedMax: 1 } },
  ])("labels the hop $label when its edge has $limitNames", ({ label, limits }) => {
    const line = {
      ...implementationDefinition,
      edges: implementationDefinition.edges.map((edge) =>
        edge.from === "review" && edge.on === "changes_requested" ? { ...edge, ...limits } : edge,
      ),
    };
    const fromReview = deriveVisibleGraph(line).edges.filter((edge) => edge.from === "review");

    expect(fromReview).toEqual([
      { from: "review", to: "retrospective", on: "success", tone: "ok", label: "success", branching: true },
      { from: "review", to: "address", on: "changes_requested", tone: "warn", label, branching: true },
      { from: "review", to: "retrospective", on: "failed", tone: "err", label: "failed", branching: true },
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
