// Ported from lore's `@re-cinq/lore-assembly-lines` (transition.test.ts),
// trimmed and adapted to this package's types:
//
//   - `on`/`iteration_max` on edges become `iterationMax` (camelCase, this
//     repo's convention); node `type` becomes optional `kind`.
//   - Dropped: every test exercising `failureClass` / `failureDetail`
//     (permanent-failure short-circuit, the credit-gate case, the
//     iteration_max-reason-carries-the-station's-detail cases, the
//     unclaimed-node case). None has a counterpart — see the file header of
//     ../src/transition.ts for why.
//   - Dropped: "walks every builtin assembly line to finish on success" and
//     the feature-planning rework test, both of which loaded lore's builtin
//     YAML lines. This package has no loader; the line-authoring layer is
//     separate. The rework case is kept, rewritten against a small inline
//     graph with the same shape (a station's objection routes back to the
//     step that fed it, then fails once that edge's budget is spent).
import { describe, it, expect } from "vitest";
import { selectEdge, getNextTransition, type NodeVisit, type WalkGraph } from "./transition.js";

const reviewLoop: WalkGraph = {
  name: "review-loop",
  entry: "implement",
  exit: "done",
  nodes: [
    { id: "implement", kind: "agent" },
    { id: "validate", kind: "service" },
    { id: "review", kind: "agent" },
    { id: "done" },
  ],
  edges: [
    { from: "implement", to: "validate", on: "success" },
    { from: "validate", to: "review", on: "success" },
    { from: "review", to: "done", on: "success" },
    { from: "review", to: "implement", on: "changes_requested", iterationMax: 2 },
  ],
};

const alwaysLoop: WalkGraph = {
  name: "always-loop",
  entry: "validate",
  exit: "done",
  nodes: [
    { id: "validate", kind: "service" },
    { id: "address", kind: "agent" },
    { id: "done" },
  ],
  edges: [
    { from: "validate", to: "done", on: "success" },
    { from: "validate", to: "address", on: "failed" },
    { from: "address", to: "validate", on: "always", iterationMax: 1 },
  ],
};

const visit = (
  nodeId: string,
  iteration: number,
  outcome: string | null,
): NodeVisit => ({ nodeId, iteration, outcome });

const selfRetry: WalkGraph = {
  name: "feature-planning",
  entry: "analyze",
  exit: "done",
  nodes: [
    { id: "analyze", kind: "agent" },
    { id: "done" },
  ],
  edges: [
    { from: "analyze", to: "done", on: "success" },
    { from: "analyze", to: "done", on: "changes_requested" },
    { from: "analyze", to: "analyze", on: "failed", iterationMax: 1 },
  ],
};

const forwardOnFailed: WalkGraph = {
  name: "forward-on-failed",
  entry: "review",
  exit: "done",
  nodes: [
    { id: "review", kind: "agent" },
    { id: "retro" },
    { id: "done" },
  ],
  edges: [
    { from: "review", to: "done", on: "success" },
    { from: "review", to: "done", on: "changes_requested" },
    { from: "review", to: "retro", on: "failed" },
    { from: "retro", to: "done", on: "always" },
  ],
};

describe("selectEdge", () => {
  it("prefers the exact-outcome edge over always", () => {
    expect(selectEdge(alwaysLoop, "validate", "failed")?.to).toBe("address");
    expect(selectEdge(alwaysLoop, "address", "success")?.to).toBe("validate");
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
    const visits = [
      visit("implement", 1, "success"),
      visit("validate", 1, "success"),
      visit("review", 1, "changes_requested"),
      visit("implement", 2, "success"),
      visit("validate", 2, "success"),
      visit("review", 2, "changes_requested"),
      visit("implement", 3, "success"),
      visit("validate", 3, "success"),
      visit("review", 3, "changes_requested"),
    ];

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
    const t = getNextTransition(reviewLoop, [visit("implement", 1, "failed")]);

    expect(t).toMatchObject({ kind: "fail", outcome: "error" });
    expect((t as { reason: string }).reason).toContain(
      'no edge from "implement" for outcome "failed"',
    );
  });

  it("fails when the visit history exceeds maxNodes", () => {
    const t = getNextTransition(reviewLoop, [visit("implement", 1, "success")], 1);

    expect(t).toMatchObject({ kind: "fail", outcome: "error" });
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
    const t = getNextTransition(reviewLoop, visits);

    expect(t).toMatchObject({ kind: "fail", outcome: "error" });
    expect((t as { reason: string }).reason).toContain("diverge");
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

  it("routes issues' objection back to decompose, then fails once that edge's budget is spent", () => {
    const visits: NodeVisit[] = [
      { nodeId: "decompose", iteration: 1, outcome: "success" },
      { nodeId: "issues", iteration: 1, outcome: "changes_requested" },
    ];

    expect(getNextTransition(decompose, visits)).toMatchObject({
      kind: "launch",
      nodeId: "decompose",
      iteration: 2,
    });

    visits.push(
      { nodeId: "decompose", iteration: 2, outcome: "success" },
      { nodeId: "issues", iteration: 2, outcome: "changes_requested" },
    );

    expect(getNextTransition(decompose, visits).kind).toBe("fail");
  });
});

const twoWaysBack: WalkGraph = {
  name: "two-ways-back",
  entry: "implement",
  exit: "done",
  nodes: [
    { id: "implement", kind: "agent" },
    { id: "validate", kind: "service" },
    { id: "done" },
  ],
  edges: [
    { from: "implement", to: "validate", on: "success" },
    { from: "implement", to: "implement", on: "failed", iterationMax: 1 },
    { from: "implement", to: "done", on: "changes_requested" },
    { from: "validate", to: "done", on: "success" },
    { from: "validate", to: "implement", on: "failed", iterationMax: 1 },
  ],
};

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
    const visits = [
      visit("implement", 1, "success"),
      visit("validate", 1, "success"),
      visit("review", 1, "changes_requested"),
      visit("implement", 2, "success"),
      visit("validate", 2, "success"),
      visit("review", 2, "changes_requested"),
      visit("implement", 3, "success"),
      visit("validate", 3, "success"),
      handRun("review", 3, "changes_requested"),
    ];

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
