import { describe, it, expect } from "vitest";
import { badgesOf } from "./node-badges";
import type { VisibleNode } from "./graph-view-model";

const plainNode: VisibleNode = { id: "work", type: "agent", outcomes: [], isEntry: false, isExit: false, isFail: false, hasProblem: false };

describe("badgesOf", () => {
  it("gives a plain node no badge", () => {
    expect(badgesOf(plainNode)).toEqual([]);
  });

  it("names the entry, the exit and the fail node", () => {
    expect([
      badgesOf({ ...plainNode, isEntry: true }),
      badgesOf({ ...plainNode, isExit: true }),
      badgesOf({ ...plainNode, isFail: true }),
    ]).toEqual([
      [{ kind: "entry", label: "entry", description: "the line starts here" }],
      [{ kind: "exit", label: "exit", description: "the line ends here" }],
      [{ kind: "fail", label: "fail", description: "the line ends here as failed" }],
    ]);
  });

  it("marks a fan-out with what it fans over", () => {
    expect(badgesOf({ ...plainNode, fanout: { over: "items", to: "worker" } })).toEqual([
      { kind: "fanout", label: "fan-out", description: "fans out over items to worker" },
    ]);
  });

  it("marks an outside start with its event", () => {
    expect(badgesOf({ ...plainNode, outsideStart: "pr.opened" })).toEqual([
      { kind: "event", label: "event", description: "started by the outside event pr.opened" },
    ]);
  });

  it("marks a node with a problem, after the others", () => {
    expect(badgesOf({ ...plainNode, isEntry: true, hasProblem: true }).map(({ kind }) => kind)).toEqual(["entry", "problem"]);
  });
});
