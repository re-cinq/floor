import { describe, it, expect } from "vitest";
import { selectEdge, getNextTransition, type WalkGraph } from "./transition.js";
import { visit, reviewLoop, alwaysLoop, selfRetry, forwardOnFailed, twoRoundsThenThirdRoundSetup } from "./transition.fixtures.js";

describe("selectEdge", () => {
  it("prefers the exact-outcome edge over always", () => {
    expect({
      onFailed: selectEdge(alwaysLoop, "validate", "failed")?.to,
      onSuccess: selectEdge(alwaysLoop, "address", "success")?.to,
    }).toEqual({ onFailed: "address", onSuccess: "validate" });
  });

  it("returns null when no edge matches the outcome", () => {
    expect(selectEdge(reviewLoop, "implement", "failed")).toBeNull();
  });
});

describe("getNextTransition on a failure with no retry edge", () => {
  it("still retries a budgeted self-edge, which is what iteration_max is for", () => {
    expect(getNextTransition(selfRetry, [visit("analyze", 1, "failed")])).toEqual({
      kind: "launch",
      nodeId: "analyze",
      iteration: 2,
    });
  });

  it("routes a failure forward when the edge is not a retry", () => {
    expect(getNextTransition(forwardOnFailed, [visit("review", 1, "failed")])).toEqual({
      kind: "launch",
      nodeId: "retro",
      iteration: 1,
    });
  });
});

describe("getNextTransition", () => {
  it("launches the entry node at iteration 1 on an empty history", () => {
    expect(getNextTransition(reviewLoop, [])).toEqual({
      kind: "launch",
      nodeId: "implement",
      iteration: 1,
    });
  });

  it("awaits while the newest visit is still open", () => {
    expect(getNextTransition(reviewLoop, [visit("implement", 1, null)])).toEqual({
      kind: "await",
    });
  });

  it("launches the next node after a success outcome", () => {
    expect(getNextTransition(reviewLoop, [visit("implement", 1, "success")])).toEqual({
      kind: "launch",
      nodeId: "validate",
      iteration: 1,
    });
  });

  it("routes changes_requested back to implement with a bumped iteration", () => {
    const visits = [
      visit("implement", 1, "success"),
      visit("validate", 1, "success"),
      visit("review", 1, "changes_requested"),
    ];

    expect(getNextTransition(reviewLoop, visits)).toEqual({
      kind: "launch",
      nodeId: "implement",
      iteration: 2,
    });
  });

  it("finishes when the walk reaches the exit", () => {
    const visits = [
      visit("implement", 1, "success"),
      visit("validate", 1, "success"),
      visit("review", 1, "success"),
    ];

    expect(getNextTransition(reviewLoop, visits)).toEqual({ kind: "finish" });
  });

  it("fails with iteration_max when a back-edge exceeds its budget", () => {
    const visits = [...twoRoundsThenThirdRoundSetup(), visit("review", 3, "changes_requested")];

    expect(getNextTransition(reviewLoop, visits)).toMatchObject({
      kind: "fail",
      outcome: "iteration_max",
    });
  });

  it("counts an always back-edge toward its iteration_max budget", () => {
    const visits = [
      visit("validate", 1, "failed"),
      visit("address", 1, "success"),
      visit("validate", 2, "failed"),
      visit("address", 2, "success"),
    ];

    expect(getNextTransition(alwaysLoop, visits)).toMatchObject({
      kind: "fail",
      outcome: "iteration_max",
    });
  });

  it("fails with a no-edge error when no edge matches the outcome", () => {
    const transition = getNextTransition(reviewLoop, [visit("implement", 1, "failed")]);

    expect(transition).toMatchObject({
      kind: "fail",
      outcome: "error",
      reason: expect.stringContaining('no edge from "implement" for outcome "failed"'),
    });
  });

  it("fails when the visit history exceeds maxNodes", () => {
    const transition = getNextTransition(reviewLoop, [visit("implement", 1, "success")], 1);

    expect(transition).toMatchObject({ kind: "fail", outcome: "error" });
  });

  it("counts only the visits since a person last acted toward maxNodes (a human station gates every pass of a human loop, so its length is not a runaway)", () => {
    const humanLoop: WalkGraph = {
      name: "human-loop",
      entry: "draft",
      exit: "done",
      nodes: [
        { id: "draft", kind: "agent" },
        { id: "review", kind: "human" },
      ],
      edges: [
        { from: "draft", to: "review", on: "success" },
        { from: "review", to: "draft", on: "changes_requested" },
        { from: "review", to: "done", on: "success" },
      ],
    };
    const visits = [
      visit("draft", 1, "success"),
      visit("review", 1, "changes_requested"),
      visit("draft", 2, "success"),
      visit("review", 2, "changes_requested"),
    ];

    expect([
      getNextTransition(humanLoop, visits, 2),
      getNextTransition(humanLoop, [...visits, visit("draft", 3, "success")], 1),
    ]).toMatchObject([
      { kind: "launch", nodeId: "draft", iteration: 3 },
      { kind: "fail", outcome: "error" },
    ]);
  });

  it("fails when a recorded node's iteration diverges from the recomputed walk (implement@1 succeeded but next row persisted as validate@2)", () => {
    const visits = [visit("implement", 1, "success"), visit("validate", 2, "success")];
    const transition = getNextTransition(reviewLoop, visits);

    expect(transition).toMatchObject({
      kind: "fail",
      outcome: "error",
      reason: expect.stringContaining("diverge"),
    });
  });

  it("numbers a first-time budgeted hop at iteration 1 (no prior visit of the target to look up)", () => {
    const budgetedForwardEdge: WalkGraph = {
      name: "budgeted-forward",
      entry: "a",
      exit: "done",
      nodes: [{ id: "a", kind: "agent" }, { id: "b", kind: "agent" }, { id: "done" }],
      edges: [
        { from: "a", to: "b", on: "success", iterationMax: 3 },
        { from: "a", to: "done", on: "changes_requested" },
        { from: "a", to: "done", on: "failed" },
        { from: "b", to: "done", on: "always" },
      ],
    };

    expect(getNextTransition(budgetedForwardEdge, [visit("a", 1, "success")])).toEqual({
      kind: "launch",
      nodeId: "b",
      iteration: 1,
    });
  });
});

describe("getNextTransition on a run started at a node other than the line's entry", () => {
  it("launches review after a run entered at validate reports success, rather than diverging from implement", () => {
    expect(getNextTransition(reviewLoop, [visit("validate", 1, "success")])).toEqual({
      kind: "launch",
      nodeId: "review",
      iteration: 1,
    });
  });

  it("awaits while the visit the run entered at, validate, is still open", () => {
    expect(getNextTransition(reviewLoop, [visit("validate", 1, null)])).toEqual({ kind: "await" });
  });

  it("walks on from the entered node across later visits: validate, review, then implement at iteration 1", () => {
    const visits = [visit("validate", 1, "success"), visit("review", 1, "changes_requested")];

    expect(getNextTransition(reviewLoop, visits)).toEqual({
      kind: "launch",
      nodeId: "implement",
      iteration: 1,
    });
  });

  it("still fails a later row that is not where the walk got to", () => {
    const visits = [visit("validate", 1, "success"), visit("implement", 1, "success")];

    expect(getNextTransition(reviewLoop, visits)).toMatchObject({
      kind: "fail",
      outcome: "error",
      reason: expect.stringContaining('recorded "implement" iter 1, expected "review" iter 1'),
    });
  });
});
