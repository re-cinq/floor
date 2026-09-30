import { describe, expect, it } from "vitest";
import { validateLine } from "./line-validation.js";
import type { KnownDefinitions } from "./line-validation.js";
import type { LineBody, StationBody } from "./types.js";

function reviewer(outcomes: string[]): StationBody {
  return { kind: "agent", outcomes, needs: [], produces: [] };
}

function known(outcomes: string[]): KnownDefinitions {
  return { stations: new Set(["reviewer"]), bodies: new Map([["reviewer", reviewer(outcomes)]]) };
}

describe("validateLine, outcome-edge coverage", () => {
  it("reports an outcome the station declares that has no edge", () => {
    const line: LineBody = {
      entry: "review",
      exit: "done",
      args: {},
      nodes: [{ id: "review", station: "reviewer" }, { id: "done" }],
      edges: [{ from: "review", to: "done", on: "success" }],
    };

    expect(validateLine(line, known(["success", "changes_requested"]))).toEqual([`node "review" has no edge for outcome "changes_requested"`]);
  });

  it("accepts an outcome covered only by an always edge", () => {
    const line: LineBody = {
      entry: "review",
      exit: "done",
      args: {},
      nodes: [{ id: "review", station: "reviewer" }, { id: "done" }],
      edges: [{ from: "review", to: "done", on: "always" }],
    };

    expect(validateLine(line, known(["success", "changes_requested"]))).toEqual([]);
  });

  it("skips a node whose station is pinned by hash", () => {
    const line: LineBody = {
      entry: "review",
      exit: "done",
      args: {},
      nodes: [{ id: "review", station: "reviewer@abc123" }, { id: "done" }],
      edges: [{ from: "review", to: "done", on: "success" }],
    };

    expect(validateLine(line, known(["success", "changes_requested"]))).toEqual([]);
  });

  it("returns no new messages when bodies is absent", () => {
    const line: LineBody = {
      entry: "review",
      exit: "done",
      args: {},
      nodes: [{ id: "review", station: "reviewer" }, { id: "done" }],
      edges: [{ from: "review", to: "done", on: "success" }],
    };

    expect(validateLine(line, { stations: new Set(["reviewer"]) })).toEqual([]);
  });
});
