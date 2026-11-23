import { describe, expect, it } from "vitest";
import { validateLine } from "./line-validation.js";
import type { KnownDefinitions } from "./line-validation.js";
import type { LineBody, StationBody } from "./types.js";

function agent(outcomes: string[]): StationBody {
  return { kind: "agent", outcomes, needs: [], produces: [] };
}

function human(outcomes: string[]): StationBody {
  return { kind: "human", outcomes, needs: [], produces: [] };
}

function selfLoopLine(iterationMax?: number): LineBody {
  return {
    entry: "retry",
    exit: "done",
    args: {},
    nodes: [{ id: "retry", station: "worker" }, { id: "done" }],
    edges: [{ from: "retry", to: "retry", on: "failed", iterationMax }, { from: "retry", to: "done", on: "success" }],
  };
}

function twoNodeCycleLine(replyStation: string): LineBody {
  return {
    entry: "review",
    exit: "done",
    args: {},
    nodes: [{ id: "review", station: "worker" }, { id: "reply", station: replyStation }, { id: "done" }],
    edges: [
      { from: "review", to: "reply", on: "changes_requested" },
      { from: "reply", to: "review", on: "changes_requested" },
      { from: "review", to: "done", on: "success" },
      { from: "reply", to: "done", on: "success" },
    ],
  };
}

describe("validateLine, cycle guard", () => {
  it("reports a self-loop with no iteration_max", () => {
    const known: KnownDefinitions = { stations: new Set(["worker"]), bodies: new Map([["worker", agent(["success", "failed"])]]) };

    expect(validateLine(selfLoopLine(undefined), known)).toEqual([`cycle through "retry" has no iteration_max and no human node`]);
  });

  it("accepts a self-loop guarded by iteration_max", () => {
    const known: KnownDefinitions = { stations: new Set(["worker"]), bodies: new Map([["worker", agent(["success", "failed"])]]) };

    expect(validateLine(selfLoopLine(1), known)).toEqual([]);
  });

  it("reports a two-node cycle with no human node on it", () => {
    const known: KnownDefinitions = { stations: new Set(["worker"]), bodies: new Map([["worker", agent(["success", "changes_requested"])]]) };

    expect(validateLine(twoNodeCycleLine("worker"), known)).toEqual([`cycle through "review", "reply" has no iteration_max and no human node`]);
  });

  it("accepts a two-node cycle with a human node on it", () => {
    const known: KnownDefinitions = {
      stations: new Set(["worker", "person"]),
      bodies: new Map([["worker", agent(["success", "changes_requested"])], ["person", human(["success", "changes_requested"])]]),
    };

    expect(validateLine(twoNodeCycleLine("person"), known)).toEqual([]);
  });

  it("treats every node as non-human when bodies is absent, still flagging an unbudgeted cycle", () => {
    expect(validateLine(twoNodeCycleLine("worker"), { stations: new Set(["worker"]) })).toEqual([
      `cycle through "review", "reply" has no iteration_max and no human node`,
    ]);
  });
});
