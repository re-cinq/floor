import { describe, it, expect } from "vitest";
import { getNextTransition, type WalkGraph, type NodeVisit } from "./transition.js";
import { visit, reviewLoop, twoWaysBack, twoRoundsThenThirdRoundSetup } from "./transition.fixtures.js";

describe("rework: a station's objection routes back to the step that fed it, then fails rather than looping", () => {
  const decompose: WalkGraph = {
    name: "decompose-issues",
    entry: "decompose",
    exit: "done",
    nodes: [
      { id: "decompose", kind: "agent" },
      { id: "issues", kind: "service" },
      { id: "done" },
    ],
    edges: [
      { from: "decompose", to: "issues", on: "success" },
      { from: "decompose", to: "done", on: "failed" },
      { from: "issues", to: "done", on: "success" },
      { from: "issues", to: "decompose", on: "changes_requested", iterationMax: 1 },
    ],
  };

  const oneRoundOfObjection: NodeVisit[] = [
    { nodeId: "decompose", iteration: 1, outcome: "success" },
    { nodeId: "issues", iteration: 1, outcome: "changes_requested" },
  ];

  it("routes issues' objection back to decompose for another round", () => {
    expect(getNextTransition(decompose, oneRoundOfObjection)).toMatchObject({
      kind: "launch",
      nodeId: "decompose",
      iteration: 2,
    });
  });

  it("fails once that edge's budget is spent on the second round", () => {
    const visits = [
      ...oneRoundOfObjection,
      { nodeId: "decompose", iteration: 2, outcome: "success" },
      { nodeId: "issues", iteration: 2, outcome: "changes_requested" },
    ];

    expect(getNextTransition(decompose, visits).kind).toBe("fail");
  });
});

describe("getNextTransition — a revisit numbers past every prior visit", () => {
  it("launches implement at iteration 3 when validate sends the walk back after implement already retried itself (per-edge counting previously deadlocked on the existing iteration 2 row)", () => {
    const visits = [
      visit("implement", 1, "failed"),
      visit("implement", 2, "success"),
      visit("validate", 2, "failed"),
    ];

    expect(getNextTransition(twoWaysBack, visits)).toEqual({
      kind: "launch",
      nodeId: "implement",
      iteration: 3,
    });
  });

  it("still spends each back-edge's own budget", () => {
    const visits = [
      visit("implement", 1, "failed"),
      visit("implement", 2, "success"),
      visit("validate", 2, "failed"),
      visit("implement", 3, "success"),
      visit("validate", 3, "failed"),
    ];

    expect(getNextTransition(twoWaysBack, visits)).toMatchObject({
      kind: "fail",
      outcome: "iteration_max",
    });
  });
});

describe("a visit a person opened by hand restarts the walk there", () => {
  const handRun = (nodeId: string, iteration: number, outcome: string | null): NodeVisit => ({
    ...visit(nodeId, iteration, outcome),
    requestedBy: "gedaiu",
  });

  it("launches validate after review failed and the person ran implement again as iteration 2", () => {
    const visits = [
      visit("implement", 1, "success"),
      visit("validate", 1, "success"),
      visit("review", 1, "failed"),
      handRun("implement", 2, "success"),
    ];

    expect(getNextTransition(reviewLoop, visits)).toEqual({
      kind: "launch",
      nodeId: "validate",
      iteration: 2,
    });
  });

  it("awaits the hand-run review while it is still open", () => {
    const visits = [
      visit("implement", 1, "success"),
      visit("validate", 1, "failed"),
      handRun("review", 1, null),
    ];

    expect(getNextTransition(reviewLoop, visits)).toEqual({ kind: "await" });
  });

  it("launches implement at iteration 4 when the spent review budget restarts at a hand-run review", () => {
    const visits = [...twoRoundsThenThirdRoundSetup(), handRun("review", 3, "changes_requested")];

    expect(getNextTransition(reviewLoop, visits)).toEqual({
      kind: "launch",
      nodeId: "implement",
      iteration: 4,
    });
  });

  it("launches validate at iteration 3 when the person ran implement as iteration 2 after validate already ran twice", () => {
    const visits = [
      visit("implement", 1, "success"),
      visit("validate", 1, "success"),
      visit("review", 1, "changes_requested"),
      visit("implement", 2, "failed"),
      visit("validate", 2, "failed"),
      handRun("implement", 3, "success"),
    ];

    expect(getNextTransition(reviewLoop, visits)).toEqual({
      kind: "launch",
      nodeId: "validate",
      iteration: 3,
    });
  });

  it("finishes when the hand-run review succeeds after an earlier run failed at validate", () => {
    const visits = [
      visit("implement", 1, "success"),
      visit("validate", 1, "failed"),
      handRun("review", 1, "success"),
    ];

    expect(getNextTransition(reviewLoop, visits)).toEqual({ kind: "finish" });
  });
});
