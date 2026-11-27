import type { LineBody } from "@re-cinq/floor-contracts";

export const approvalLine: LineBody = {
  entry: "approve",
  exit: "approve",
  args: {},
  nodes: [{ id: "approve", reports: [{ on: "release.answered", when: { decision: "approved" }, outcome: "approved" }] }],
  edges: [],
};

export const pullRequestLine: LineBody = {
  entry: "review",
  exit: "merged",
  args: {},
  start: { on: ["github.pull_request.opened"], when: { draft: false }, args: {} },
  nodes: [
    { id: "review" },
    {
      id: "merged",
      reports: [
        { on: "github.pull_request.closed", when: { merged: true }, outcome: "success" },
        { on: "github.pull_request.closed", when: { merged: false }, outcome: "failed" },
      ],
    },
  ],
  edges: [],
};
