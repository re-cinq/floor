import { describe, expect, it } from "vitest";
import type { WalkGraph } from "@re-cinq/floor-assembly-lines";
import { resolveNeeds, visitIdsSincePersonActed } from "./resolve.js";
import type { Item, NeedSpec, Visit } from "./types.js";

const GRAPH: WalkGraph = {
  name: "plan",
  entry: "build",
  exit: "done",
  edges: [],
  nodes: [{ id: "build" }, { id: "author", kind: "human" }, { id: "check" }],
};

function visitOf(id: string, nodeId: string, requestedBy: string | null = null): Visit {
  return {
    id,
    runId: "run-1",
    nodeId,
    iteration: 1,
    stationHash: null,
    agentDefinitionHash: null,
    brief: { needs: {}, iteration: 1 },
    report: null,
    worker: null,
    requestedBy,
    branch: null,
    deadline: null,
    openedAt: new Date(0),
    finishedAt: null,
    resumedFrom: null,
    agentSettings: null,
  };
}

function verdictBag(by: string): Record<string, Item> {
  return { verdict: { kind: "value", ref: "approve", by } };
}

describe("resolveNeeds with a fresh need", () => {
  it.each([
    {
      optional: true,
      outcome: "leaves out an optional",
      expected: { needs: {}, missing: [] },
    },
    {
      optional: false,
      outcome: "reports as missing a required",
      expected: { needs: {}, missing: ["verdict (not produced since a person last acted)"] },
    },
  ])("$outcome fresh verdict produced by visit-1 when a person acted at visit-2", ({ optional, expected }) => {
    const spec: NeedSpec = { name: "verdict", kind: "value", fresh: true, optional };

    expect(resolveNeeds([spec], undefined, verdictBag("visit-1"), new Set(["visit-2"]))).toEqual(expected);
  });

  it("fills a fresh verdict produced by visit-2 when a person acted at visit-2", () => {
    const spec: NeedSpec = { name: "verdict", kind: "value", fresh: true };

    expect(resolveNeeds([spec], undefined, verdictBag("visit-2"), new Set(["visit-2"]))).toEqual({
      needs: { verdict: "approve" },
      missing: [],
    });
  });

  it("fills a fresh verdict produced by pr.opened when nobody has acted", () => {
    const spec: NeedSpec = { name: "verdict", kind: "value", fresh: true };

    expect(resolveNeeds([spec], undefined, verdictBag("pr.opened"))).toEqual({
      needs: { verdict: "approve" },
      missing: [],
    });
  });

  it("fills a verdict without fresh produced by visit-1 when a person acted at visit-2", () => {
    const spec: NeedSpec = { name: "verdict", kind: "value" };

    expect(resolveNeeds([spec], undefined, verdictBag("visit-1"), new Set(["visit-2"]))).toEqual({
      needs: { verdict: "approve" },
      missing: [],
    });
  });
});

describe("visitIdsSincePersonActed", () => {
  it("returns undefined when no visit is a human node's and none was started by hand", () => {
    const visits = [visitOf("visit-1", "build"), visitOf("visit-2", "check")];

    expect(visitIdsSincePersonActed(GRAPH, visits)).toBeUndefined();
  });

  it("returns the human node's visit and those after it when a human visit is the second of three", () => {
    const visits = [visitOf("visit-1", "build"), visitOf("visit-2", "author"), visitOf("visit-3", "check")];

    expect(visitIdsSincePersonActed(GRAPH, visits)).toEqual(new Set(["visit-2", "visit-3"]));
  });

  it("returns the hand-started visit and those after it when it comes after the human visit", () => {
    const visits = [visitOf("visit-1", "author"), visitOf("visit-2", "build"), visitOf("visit-3", "check", "ana"), visitOf("visit-4", "build")];

    expect(visitIdsSincePersonActed(GRAPH, visits)).toEqual(new Set(["visit-3", "visit-4"]));
  });
});
