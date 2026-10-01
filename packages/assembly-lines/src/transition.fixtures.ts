// Graphs and visit builders shared across the transition test files, so a fixture used by both never drifts into two copies.
import type { NodeVisit, WalkGraph } from "./transition.js";

export const visit = (
  nodeId: string,
  iteration: number,
  outcome: string | null,
): NodeVisit => ({ nodeId, iteration, outcome });

export const reviewLoop: WalkGraph = {
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

export const alwaysLoop: WalkGraph = {
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

export const selfRetry: WalkGraph = {
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

export const forwardOnFailed: WalkGraph = {
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

export const twoWaysBack: WalkGraph = {
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

export const postOrFail: WalkGraph = {
  name: "post-or-fail",
  entry: "post",
  exit: "done",
  fail: "failed",
  nodes: [
    { id: "post", kind: "service" },
    { id: "done" },
    { id: "failed" },
  ],
  edges: [
    { from: "post", to: "done", on: "success" },
    { from: "post", to: "failed", on: "failed" },
  ],
};

const THIRD_ROUND = 3;

// Two full implement/validate/review rounds, each ending in changes_requested, plus round 3's setup — shared by the iteration_max test and the hand-run test that diverges from it only in the final visit.
export function twoRoundsThenThirdRoundSetup(): NodeVisit[] {
  return [
    visit("implement", 1, "success"),
    visit("validate", 1, "success"),
    visit("review", 1, "changes_requested"),
    visit("implement", 2, "success"),
    visit("validate", 2, "success"),
    visit("review", 2, "changes_requested"),
    visit("implement", THIRD_ROUND, "success"),
    visit("validate", THIRD_ROUND, "success"),
  ];
}
