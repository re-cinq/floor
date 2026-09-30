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

describe("validateLine, cycle guard", () => {
  it("reports a self-loop with no iteration_max", () => {
    const line: LineBody = {
      entry: "retry",
      exit: "done",
      args: {},
      nodes: [{ id: "retry", station: "worker" }, { id: "done" }],
      edges: [{ from: "retry", to: "retry", on: "failed" }, { from: "retry", to: "done", on: "success" }],
    };
    const known: KnownDefinitions = { stations: new Set(["worker"]), bodies: new Map([["worker", agent(["success", "failed"])]]) };

    expect(validateLine(line, known)).toEqual([`cycle through "retry" has no iteration_max and no human node`]);
  });

  it("accepts a self-loop guarded by iteration_max", () => {
    const line: LineBody = {
      entry: "retry",
      exit: "done",
      args: {},
      nodes: [{ id: "retry", station: "worker" }, { id: "done" }],
      edges: [{ from: "retry", to: "retry", on: "failed", iterationMax: 1 }, { from: "retry", to: "done", on: "success" }],
    };
    const known: KnownDefinitions = { stations: new Set(["worker"]), bodies: new Map([["worker", agent(["success", "failed"])]]) };

    expect(validateLine(line, known)).toEqual([]);
  });

  it("reports a two-node cycle with no human node on it", () => {
    const line: LineBody = {
      entry: "review",
      exit: "done",
      args: {},
      nodes: [{ id: "review", station: "worker" }, { id: "reply", station: "worker" }, { id: "done" }],
      edges: [
        { from: "review", to: "reply", on: "changes_requested" },
        { from: "reply", to: "review", on: "changes_requested" },
        { from: "review", to: "done", on: "success" },
        { from: "reply", to: "done", on: "success" },
      ],
    };
    const known: KnownDefinitions = { stations: new Set(["worker"]), bodies: new Map([["worker", agent(["success", "changes_requested"])]]) };

    expect(validateLine(line, known)).toEqual([`cycle through "review", "reply" has no iteration_max and no human node`]);
  });

  it("accepts a two-node cycle with a human node on it", () => {
    const line: LineBody = {
      entry: "review",
      exit: "done",
      args: {},
      nodes: [{ id: "review", station: "worker" }, { id: "reply", station: "person" }, { id: "done" }],
      edges: [
        { from: "review", to: "reply", on: "changes_requested" },
        { from: "reply", to: "review", on: "changes_requested" },
        { from: "review", to: "done", on: "success" },
        { from: "reply", to: "done", on: "success" },
      ],
    };
    const known: KnownDefinitions = {
      stations: new Set(["worker", "person"]),
      bodies: new Map([["worker", agent(["success", "changes_requested"])], ["person", human(["success", "changes_requested"])]]),
    };

    expect(validateLine(line, known)).toEqual([]);
  });

  it("treats every node as non-human when bodies is absent, still flagging an unbudgeted cycle", () => {
    const line: LineBody = {
      entry: "review",
      exit: "done",
      args: {},
      nodes: [{ id: "review", station: "worker" }, { id: "reply", station: "worker" }, { id: "done" }],
      edges: [
        { from: "review", to: "reply", on: "changes_requested" },
        { from: "reply", to: "review", on: "changes_requested" },
        { from: "review", to: "done", on: "success" },
        { from: "reply", to: "done", on: "success" },
      ],
    };

    expect(validateLine(line, { stations: new Set(["worker"]) })).toEqual([`cycle through "review", "reply" has no iteration_max and no human node`]);
  });
});
