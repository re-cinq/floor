import { describe, expect, it } from "vitest";
import { standInActionsOf } from "./stand-in-actions.js";
import { humanApprovalLine, reviewLoopLine } from "./test-run.fixtures.js";

describe("standInActionsOf", () => {
  it("offers review a plain approved with review_feedback as an optional other output, and a changes_requested asking for required review_feedback", () => {
    expect(standInActionsOf(reviewLoopLine, "review")).toEqual([
      {
        kind: "report",
        outcome: "approved",
        fields: [],
        others: [{ name: "review_feedback", kind: "value", required: false }],
      },
      {
        kind: "report",
        outcome: "changes_requested",
        fields: [{ name: "review_feedback", kind: "value", required: true }],
        others: [],
      },
    ]);
  });

  it("offers approve the event release.answered with decision approved and with decision rejected, and an escalated with no fields and no other outputs", () => {
    expect(standInActionsOf(humanApprovalLine, "approve")).toEqual([
      { kind: "event", outcome: "approved", event: "release.answered", payload: { decision: "approved" } },
      { kind: "event", outcome: "rejected", event: "release.answered", payload: { decision: "rejected" } },
      { kind: "report", outcome: "escalated", fields: [], others: [] },
    ]);
  });
});
