import { describe, expect, it } from "vitest";
import { validateLine } from "./line-validation.js";
import type { LineBody } from "./types.js";

const NO_STATIONS = { stations: new Set<string>() };

function cycleLine(exit: string, second: string): LineBody {
  return {
    entry: "start",
    exit,
    args: {},
    nodes: [{ id: "start" }, { id: second }],
    edges: [
      { from: "start", to: second, on: "x" },
      { from: second, to: "start", on: "y" },
    ],
  };
}

describe("validateLine", () => {
  it("entry not a node", () => {
    const line: LineBody = { entry: "missing", exit: "done", args: {}, nodes: [{ id: "done" }], edges: [] };

    expect(validateLine(line, NO_STATIONS)).toEqual([`entry "missing" is not a node`]);
  });

  it("exit not a node", () => {
    expect(validateLine(cycleLine("missing", "end"), NO_STATIONS)).toEqual([`exit "missing" is not a node`]);
  });

  it("edge from not a node", () => {
    const line: LineBody = { entry: "done", exit: "done", args: {}, nodes: [{ id: "done" }], edges: [{ from: "missing", to: "done", on: "x" }] };

    expect(validateLine(line, NO_STATIONS)).toEqual([`edge 0: from "missing" is not a node`]);
  });

  it("edge to not a node", () => {
    const line: LineBody = {
      entry: "start",
      exit: "done",
      args: {},
      nodes: [{ id: "start" }, { id: "done" }],
      edges: [{ from: "start", to: "missing", on: "x" }],
    };

    expect(validateLine(line, NO_STATIONS)).toEqual([`edge 0: to "missing" is not a node`]);
  });

  it("duplicate node id", () => {
    const line: LineBody = { entry: "start", exit: "start", args: {}, nodes: [{ id: "start" }, { id: "start" }], edges: [] };

    expect(validateLine(line, NO_STATIONS)).toEqual([`node id "start" is used more than once`]);
  });

  it("edge leaves exit", () => {
    expect(validateLine(cycleLine("end", "end"), NO_STATIONS)).toEqual([`edge 1: exit "end" cannot have an outgoing edge`]);
  });

  it("node has no outgoing edge", () => {
    const line: LineBody = {
      entry: "start",
      exit: "end",
      args: {},
      nodes: [{ id: "start" }, { id: "middle" }, { id: "end" }],
      edges: [{ from: "start", to: "end", on: "x" }],
    };

    expect(validateLine(line, NO_STATIONS)).toEqual([`node "middle" has no outgoing edge`]);
  });

  it("start arg not declared", () => {
    const line: LineBody = {
      entry: "start",
      exit: "start",
      args: {},
      start: { on: ["e"], args: { stray: "{x}" } },
      nodes: [{ id: "start" }],
      edges: [],
    };

    expect(validateLine(line, NO_STATIONS)).toEqual([`start.args names "stray", which is not a declared argument`]);
  });

  it("more than one subject arg", () => {
    const line: LineBody = {
      entry: "start",
      exit: "start",
      args: { first: { kind: "value", subject: true }, second: { kind: "value", subject: true } },
      nodes: [{ id: "start" }],
      edges: [],
    };

    expect(validateLine(line, NO_STATIONS)).toEqual(["more than one argument is marked subject"]);
  });

  it("unknown station, hash pin stripped before the lookup", () => {
    const line: LineBody = { entry: "start", exit: "start", args: {}, nodes: [{ id: "start", station: "reviewer@abc123" }], edges: [] };

    expect(validateLine(line, NO_STATIONS)).toEqual([`node "start" names unknown station "reviewer"`]);
  });

  it("station check skips a marker node, which has no station", () => {
    const line: LineBody = { entry: "start", exit: "start", args: {}, nodes: [{ id: "start" }], edges: [] };

    expect(validateLine(line, NO_STATIONS)).toEqual([]);
  });

  it("accepts a station pinned by hash when the bare name is known", () => {
    const line: LineBody = { entry: "start", exit: "start", args: {}, nodes: [{ id: "start", station: "reviewer@abc123" }], edges: [] };

    expect(validateLine(line, { stations: new Set(["reviewer"]) })).toEqual([]);
  });

  it("collects every problem in one call, not just the first", () => {
    const line: LineBody = { entry: "missing-entry", exit: "missing-exit", args: {}, nodes: [{ id: "start" }], edges: [] };

    expect(validateLine(line, NO_STATIONS)).toEqual([`entry "missing-entry" is not a node`, `exit "missing-exit" is not a node`, `node "start" has no outgoing edge`]);
  });
});
