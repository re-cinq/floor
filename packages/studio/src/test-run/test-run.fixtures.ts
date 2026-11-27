import { visitFolderName } from "./folder-names.js";
import type { TestLine } from "./test-line.js";
import type { TestRun, TestVisit } from "./test-visit.js";

export const reviewLoopLine: TestLine = {
  id: "review-loop",
  body: {
    entry: "write",
    exit: "done",
    fail: "abandoned",
    args: { topic: { kind: "value", subject: true } },
    nodes: [
      { id: "write", station: "draft-writer", bind: { feedback: "review_feedback" } },
      { id: "review", station: "reviewer" },
      { id: "done" },
      { id: "abandoned" },
    ],
    edges: [
      { from: "write", to: "review", on: "success" },
      { from: "write", to: "abandoned", on: "failed" },
      { from: "review", to: "done", on: "approved" },
      { from: "review", to: "write", on: "changes_requested", iterationMax: 3 },
    ],
  },
  stations: new Map([
    [
      "draft-writer",
      {
        kind: "agent",
        agentDefinition: "draft-writer",
        outcomes: ["success", "failed"],
        needs: [
          { name: "topic", kind: "value" },
          { name: "feedback", kind: "value", optional: true, fresh: true },
        ],
        produces: [{ name: "draft", kind: "file", path: "draft.md" }],
      },
    ],
    [
      "reviewer",
      {
        kind: "human",
        outcomes: ["approved", "changes_requested"],
        needs: [{ name: "draft", kind: "file" }],
        produces: [{ name: "review_feedback", kind: "value" }],
      },
    ],
  ]),
};

export const humanApprovalLine: TestLine = {
  id: "human-approval",
  body: {
    entry: "approve",
    exit: "done",
    fail: "declined",
    args: { release: { kind: "value", subject: true } },
    nodes: [
      {
        id: "approve",
        station: "approve-release",
        reports: [
          { on: "release.answered", when: { decision: "approved" }, outcome: "approved" },
          { on: "release.answered", when: { decision: "rejected" }, outcome: "rejected" },
        ],
      },
      { id: "done" },
      { id: "declined" },
    ],
    edges: [
      { from: "approve", to: "done", on: "approved" },
      { from: "approve", to: "declined", on: "rejected" },
      { from: "approve", to: "done", on: "escalated" },
    ],
  },
  stations: new Map([
    [
      "approve-release",
      {
        kind: "human",
        outcomes: ["approved", "rejected", "escalated"],
        needs: [{ name: "release", kind: "value" }],
        produces: [],
      },
    ],
  ]),
};

export const writeVisit = (sequence: number, iteration: number): TestVisit => {
  const id = visitFolderName(sequence, "write", iteration);

  return {
    id,
    nodeId: "write",
    iteration,
    station: "draft-writer",
    report: { outcome: "success", produced: { draft: `/runs/r1/visits/${id}/outputs/draft.md` } },
  };
};

export const failedWriteVisit = (sequence: number, iteration: number, error: string): TestVisit => ({
  id: visitFolderName(sequence, "write", iteration),
  nodeId: "write",
  iteration,
  station: "draft-writer",
  report: { outcome: "failed", error },
});

export const reviewVisit =(sequence: number, iteration: number, outcome: string, reason?: string): TestVisit => ({
  id: visitFolderName(sequence, "review", iteration),
  nodeId: "review",
  iteration,
  station: "reviewer",
  report: reason === undefined ? { outcome } : { outcome, produced: { review_feedback: reason } },
});

export const runOf = (visits: readonly TestVisit[]): TestRun => ({
  line: reviewLoopLine,
  startItems: { topic: { kind: "value", ref: "tides", by: "start" } },
  visits,
});
