import { describe, expect, it } from "vitest";
import { validateLine } from "./line-validation.js";
import type { KnownDefinitions } from "./line-validation.js";
import type { LineBody, StationBody } from "./types.js";

function known(outcomes: string[]): KnownDefinitions {
  return { stations: new Set(["reviewer"]), bodies: new Map([["reviewer", reviewer(outcomes)]]) };
}

function reviewer(outcomes: string[]): StationBody {
  return { kind: "agent", outcomes, needs: [], produces: [] };
}

function lineWithEdge(stationRef: string, edgeOn: string): LineBody {
  return {
    entry: "review",
    exit: "done",
    args: {},
    nodes: [{ id: "review", station: stationRef }, { id: "done" }],
    edges: [{ from: "review", to: "done", on: edgeOn }],
  };
}

describe("validateLine, outcome-edge coverage", () => {
  it("reports an outcome the station declares that has no edge", () => {
    expect(validateLine(lineWithEdge("reviewer", "success"), known(["success", "changes_requested"]))).toEqual([
      `node "review" has no edge for outcome "changes_requested"`,
    ]);
  });

  it("accepts an outcome covered only by an always edge", () => {
    expect(validateLine(lineWithEdge("reviewer", "always"), known(["success", "changes_requested"]))).toEqual([]);
  });

  it("accepts a fail node that names a station, with no edge for its outcomes", () => {
    const line: LineBody = {
      entry: "review",
      exit: "done",
      fail: "failed",
      args: {},
      nodes: [{ id: "review", station: "reviewer" }, { id: "done" }, { id: "failed", station: "reviewer" }],
      edges: [
        { from: "review", to: "done", on: "success" },
        { from: "review", to: "failed", on: "failed" },
      ],
    };

    expect(validateLine(line, known(["success"]))).toEqual([]);
  });

  it("skips a node whose station is pinned by hash", () => {
    expect(validateLine(lineWithEdge("reviewer@abc123", "success"), known(["success", "changes_requested"]))).toEqual([]);
  });

  it("returns no new messages when bodies is absent", () => {
    expect(validateLine(lineWithEdge("reviewer", "success"), { stations: new Set(["reviewer"]) })).toEqual([]);
  });
});
