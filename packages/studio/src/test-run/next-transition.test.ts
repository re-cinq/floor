import { describe, expect, it } from "vitest";
import { nextTransitionOf } from "./next-transition.js";
import type { Transition } from "@re-cinq/floor-assembly-lines";
import type { TestVisit } from "./test-visit.js";
import { reviewVisit, runOf, writeVisit } from "./test-run.fixtures.js";

describe("nextTransitionOf", () => {
  it("halts on iteration_max instead of opening write 5 when review 4 requests changes", () => {
    const run = runOf([
      writeVisit(1, 1),
      reviewVisit(2, 1, "changes_requested"),
      writeVisit(3, 2),
      reviewVisit(4, 2, "changes_requested"),
      writeVisit(5, 3),
      reviewVisit(6, 3, "changes_requested"),
      writeVisit(7, 4),
      reviewVisit(8, 4, "changes_requested"),
    ]);

    expect(nextTransitionOf(run)).toEqual({
      kind: "halt",
      outcome: "iteration_max",
      reason: 'AssemblyLine review-loop: node "review" failed — the review->write retry budget (3) is spent',
    });
  });

  const openWrite: TestVisit = { ...writeVisit(1, 1), report: null };
  const openReview: TestVisit = { ...reviewVisit(2, 1, "approved"), report: null };

  it.each<{ when: string; visits: TestVisit[]; expected: Transition }>([
    { when: "no visit has run", visits: [], expected: { kind: "launch", nodeId: "write", iteration: 1 } },
    { when: "write 1 is open", visits: [openWrite], expected: { kind: "await" } },
    {
      when: "write 1 reported success",
      visits: [writeVisit(1, 1)],
      expected: { kind: "launch", nodeId: "review", iteration: 1 },
    },
    { when: "review 1 is open", visits: [writeVisit(1, 1), openReview], expected: { kind: "await" } },
    {
      when: "review 1 reported approved",
      visits: [writeVisit(1, 1), reviewVisit(2, 1, "approved")],
      expected: { kind: "finish" },
    },
  ])("answers $expected.kind when $when", ({ visits, expected }) => {
    expect(nextTransitionOf(runOf(visits))).toEqual(expected);
  });
});
