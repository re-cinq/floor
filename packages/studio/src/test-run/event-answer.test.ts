import { describe, expect, it } from "vitest";
import { eventOutcomeOf } from "./event-answer.js";
import { humanApprovalLine } from "./test-run.fixtures.js";

describe("eventOutcomeOf", () => {
  it.each([
    { why: "the decision is neither approved nor rejected", nodeId: "approve", name: "release.answered", payload: { decision: "maybe" } },
    { why: "the payload carries no decision", nodeId: "approve", name: "release.answered", payload: {} },
    { why: "approve waits on release.answered, not release.requested", nodeId: "approve", name: "release.requested", payload: { decision: "approved" } },
    { why: "the event answers approve, and done is the node asked about", nodeId: "done", name: "release.answered", payload: { decision: "approved" } },
  ])("gives $nodeId no outcome from $name when $why", ({ nodeId, name, payload }) => {
    expect(eventOutcomeOf(humanApprovalLine, nodeId, { name, payload })).toBeUndefined();
  });

  it.each([
    { decision: "approved", outcome: "approved" },
    { decision: "rejected", outcome: "rejected" },
  ])("gives approve the outcome $outcome from release.answered with decision $decision", ({ decision, outcome }) => {
    expect(eventOutcomeOf(humanApprovalLine, "approve", { name: "release.answered", payload: { decision } })).toBe(outcome);
  });
});
