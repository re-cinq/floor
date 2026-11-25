import type { LineBody } from "@re-cinq/floor-contracts";

export const solveTaskBase: LineBody = {
  entry: "attempt",
  exit: "done",
  args: {},
  nodes: [{ id: "attempt", station: "solve-task" }, { id: "done" }],
  edges: [
    { from: "attempt", to: "done", on: "success" },
    { from: "attempt", to: "attempt", on: "failed", iterationMax: 3 },
  ],
};

export const solveTaskHead: LineBody = {
  ...solveTaskBase,
  nodes: [
    { id: "attempt", station: "solve-task" },
    { id: "review", station: "solve-task" },
    { id: "done" },
  ],
  edges: [
    { from: "attempt", to: "review", on: "success" },
    { from: "review", to: "done", on: "success" },
    { from: "review", to: "attempt", on: "failed" },
    { from: "attempt", to: "attempt", on: "failed", iterationMax: 5 },
  ],
};

export const escapedLine: LineBody = {
  entry: 'check "pr" <v2>',
  exit: "done",
  args: {},
  nodes: [{ id: 'check "pr" <v2>' }, { id: "done" }],
  edges: [{ from: 'check "pr" <v2>', to: "done", on: 'needs "fix" <2|3>' }],
};
