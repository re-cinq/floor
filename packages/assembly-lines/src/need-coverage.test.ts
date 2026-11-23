import { describe, expect, it } from "vitest";
import { coverageContextOf, needCoverage } from "./line-needs.js";
import { DIAMOND_STATIONS, agentStation, diamondLine as diamond } from "./diamond.fixtures.js";
import type { LineBody, NeedSpec } from "@re-cinq/floor-contracts";

const TICKET: NeedSpec = { name: "ticket", kind: "value" };

function coverageAt(line: LineBody, nodeId: string, need: NeedSpec, bodies = DIAMOND_STATIONS) {
  const node = line.nodes.find((candidate) => candidate.id === nodeId)!;

  return needCoverage(node, need, coverageContextOf(line, bodies));
}

describe("needCoverage", () => {
  it("is sometimes-empty with the path through skipper when only opener produces ticket", () => {
    expect(coverageAt(diamond(), "join", TICKET)).toEqual({ kind: "sometimes-empty", producedBy: ["opener"], pathWithout: ["start", "skipper", "join"] });
  });

  it("is filled by opener when ticket is produced on every path into join", () => {
    const line = diamond({ edges: [{ from: "start", to: "opener", on: "success" }, { from: "start", to: "opener", on: "failed" }, { from: "opener", to: "join", on: "success" }, { from: "join", to: "done", on: "success" }], nodes: diamond().nodes.filter((node) => node.id !== "skipper") });

    expect(coverageAt(line, "join", TICKET)).toEqual({ kind: "filled", producedBy: ["opener"] });
  });

  it("is never-filled when no argument seeds ticket and no station produces it", () => {
    const bodies = new Map(DIAMOND_STATIONS).set("opener", agentStation([]));

    expect(coverageAt(diamond(), "join", TICKET, bodies)).toEqual({ kind: "never-filled" });
  });

  it("is seeded when a line argument is named ticket", () => {
    expect(coverageAt(diamond({ args: { ticket: { kind: "value" } } }), "join", TICKET)).toEqual({ kind: "seeded" });
  });

  it("is seeded when a line file is named ticket", () => {
    expect(coverageAt(diamond({ files: { ticket: "abc123" } }), "join", TICKET)).toEqual({ kind: "seeded" });
  });

  it("is own-start when join names its own start event and ticket is not seeded", () => {
    const line = diamond({ nodes: diamond().nodes.map((node) => (node.id === "join" ? { ...node, start: "ticket.ready" } : node)) });

    expect(coverageAt(line, "join", TICKET)).toEqual({ kind: "own-start" });
  });

  it("is git-unseeded for a git need no git argument seeds", () => {
    expect(coverageAt(diamond(), "join", { name: "repo", kind: "git" })).toEqual({ kind: "git-unseeded" });
  });

  it("is seeded for a git need a git argument seeds", () => {
    expect(coverageAt(diamond({ args: { repo: { kind: "git" } } }), "join", { name: "repo", kind: "git" })).toEqual({ kind: "seeded" });
  });

  it("is optional for an optional need nothing seeds", () => {
    expect(coverageAt(diamond(), "join", { ...TICKET, optional: true })).toEqual({ kind: "optional" });
  });

  it("is floor-filled for item, which the floor fills in a fan-out branch", () => {
    expect(coverageAt(diamond(), "join", { name: "item", kind: "value" })).toEqual({ kind: "floor-filled" });
  });

  it("is collected for a need that gathers the branches of a fan-out", () => {
    expect(coverageAt(diamond(), "join", { name: "results", kind: "value", collect: "result" })).toEqual({ kind: "collected" });
  });

  it("answers for the bound name when the node binds ticket to another name", () => {
    const line = diamond({ nodes: diamond().nodes.map((node) => (node.id === "join" ? { ...node, bind: { ticket: "issue" } } : node)), args: { issue: { kind: "value" } } });

    expect(coverageAt(line, "join", TICKET)).toEqual({ kind: "seeded" });
  });
});
