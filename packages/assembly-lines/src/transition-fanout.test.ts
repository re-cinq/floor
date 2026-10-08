import { describe, it, expect } from "vitest";
import {
  getNextTransition,
  type NodeVisit,
  type WalkGraph,
} from "./transition.js";

const fanLine: WalkGraph = {
  name: "fan",
  entry: "sections",
  exit: "done",
  fail: "failed",
  fans: [{ source: "sections", body: "write" }],
  edges: [
    { from: "sections", to: "write", on: "success" },
    { from: "write", to: "assemble", on: "success" },
    { from: "write", to: "failed", on: "failed" },
    { from: "assemble", to: "done", on: "success" },
    {
      from: "assemble",
      to: "sections",
      on: "changes_requested",
      iterationMax: 2,
    },
  ],
};

const source = (branches: number, iteration = 1): NodeVisit => ({
  nodeId: "sections",
  iteration,
  outcome: "success",
  branches,
});

const branch = (
  index: number,
  outcome: string | null,
  iteration = 1,
): NodeVisit => ({
  nodeId: "write",
  iteration,
  branch: index,
  outcome,
});

describe("getNextTransition across a fan-out", () => {
  it("launches every branch at once, numbered, after the source reports its items", () => {
    expect(getNextTransition(fanLine, [source(3)])).toEqual({
      kind: "launch-many",
      nodeId: "write",
      iteration: 1,
      branches: [0, 1, 2],
    });
  });

  it("launches only the branches no visit holds yet, so a crash between launches heals", () => {
    expect(
      getNextTransition(fanLine, [
        source(3),
        branch(0, null),
        branch(2, "success"),
      ]),
    ).toEqual({
      kind: "launch-many",
      nodeId: "write",
      iteration: 1,
      branches: [1],
    });
  });

  it("awaits while any branch is still open", () => {
    expect(
      getNextTransition(fanLine, [
        source(3),
        branch(0, "success"),
        branch(1, null),
        branch(2, "success"),
      ]),
    ).toEqual({ kind: "await" });
  });

  it("launches the join once every branch succeeded", () => {
    expect(
      getNextTransition(fanLine, [
        source(2),
        branch(0, "success"),
        branch(1, "success"),
      ]),
    ).toEqual({ kind: "launch", nodeId: "assemble", iteration: 1 });
  });

  it("routes a failed branch as the body failing, only after every branch has finished", () => {
    const visits = [source(2), branch(0, "failed"), branch(1, null)];

    expect([
      getNextTransition(fanLine, visits),
      getNextTransition(fanLine, [...visits.slice(0, 2), branch(1, "success")]),
    ]).toEqual([
      { kind: "await" },
      {
        kind: "halt",
        outcome: "failed",
        reason: 'AssemblyLine fan: node "write" reported "failed"',
      },
    ]);
  });

  it("treats any outcome other than success on a branch as the body failing", () => {
    expect(
      getNextTransition(fanLine, [
        source(2),
        branch(0, "success"),
        branch(1, "changes_requested"),
      ]),
    ).toMatchObject({ kind: "halt", outcome: "failed" });
  });

  it("goes straight to the join when the source reports no items", () => {
    expect(getNextTransition(fanLine, [source(0)])).toEqual({
      kind: "launch",
      nodeId: "assemble",
      iteration: 1,
    });
  });

  it("fans out again on the next round with a higher iteration", () => {
    const firstRound = [
      source(2),
      branch(0, "success"),
      branch(1, "success"),
      { nodeId: "assemble", iteration: 1, outcome: "changes_requested" },
    ];

    expect(getNextTransition(fanLine, [...firstRound, source(2, 2)])).toEqual({
      kind: "launch-many",
      nodeId: "write",
      iteration: 2,
      branches: [0, 1],
    });
  });

  it("finishes after a round that ends in the exit", () => {
    expect(
      getNextTransition(fanLine, [
        source(1),
        branch(0, "success"),
        { nodeId: "assemble", iteration: 1, outcome: "success" },
      ]),
    ).toEqual({ kind: "finish" });
  });
});
