import { describe, expect, it } from "vitest";
import { nodeEvents, type CollectionLine } from "./node-events.js";
import type { LineBody, LineNode, StationBody } from "@re-cinq/floor-contracts";

const BODIES: ReadonlyMap<string, StationBody> = new Map<string, StationBody>([
  ["coder", { kind: "agent", outcomes: ["success", "failed"], needs: [], produces: [] }],
  ["checker", { kind: "service", outcomes: ["success"], needs: [], produces: [] }],
  ["approver", { kind: "human", outcomes: ["approved"], needs: [], produces: [] }],
]);

function lineOf(patch: Partial<LineBody> = {}): LineBody {
  return {
    entry: "code",
    exit: "done",
    args: {},
    nodes: [{ id: "code", station: "coder" }, { id: "check", station: "checker" }, { id: "done" }],
    edges: [
      { from: "code", to: "check", on: "success" },
      { from: "code", to: "done", on: "always" },
      { from: "check", to: "done", on: "success" },
    ],
    ...patch,
  };
}

function nodeOf(line: LineBody, id: string): LineNode {
  return line.nodes.find((node) => node.id === id)!;
}

function eventsOf(line: LineBody, id: string, lines: CollectionLine[] = []) {
  return nodeEvents(line, nodeOf(line, id), lines, BODIES);
}

describe("nodeEvents, startedBy", () => {
  it("lists node.check.start as a walk event when an edge leads to check", () => {
    expect(eventsOf(lineOf(), "check").startedBy).toEqual([{ event: "node.check.start", origin: "walk" }]);
  });

  it("lists the node's own start event as outside when the node names one", () => {
    const line = lineOf({ nodes: [{ id: "code", station: "coder" }, { id: "check", station: "checker", start: "pr.opened" }, { id: "done" }] });

    expect(eventsOf(line, "check").startedBy).toEqual([{ event: "pr.opened", origin: "outside" }]);
  });

  it("adds each start.on event with its when to the entry node", () => {
    const line = lineOf({ start: { on: ["issue.opened", "issue.edited"], when: { action: "opened" }, args: {} } });

    expect(eventsOf(line, "code").startedBy).toEqual([
      { event: "node.code.start", origin: "line-start" },
      { event: "issue.opened", origin: "line-start", when: { action: "opened" } },
      { event: "issue.edited", origin: "line-start", when: { action: "opened" } },
    ]);
  });

  it("marks a node nothing leads to and nothing starts as none", () => {
    const line = lineOf({ nodes: [{ id: "code", station: "coder" }, { id: "check", station: "checker" }, { id: "lost", station: "checker" }, { id: "done" }] });

    expect(eventsOf(line, "lost").startedBy).toEqual([{ event: "node.lost.start", origin: "none" }]);
  });
});

describe("nodeEvents, answeredBy", () => {
  it("lists each report with its event, when and outcome", () => {
    const reports = [{ on: "review.submitted", when: { state: "approved" }, outcome: "approved" }, { on: "review.dismissed", outcome: "rejected" }];
    const line = lineOf({ nodes: [{ id: "code", station: "approver", reports }, { id: "check", station: "checker" }, { id: "done" }] });
    const bodies = new Map(BODIES).set("approver", { kind: "human", outcomes: ["approved", "rejected"], needs: [], produces: [] });

    expect(nodeEvents(line, nodeOf(line, "code"), [], bodies).answeredBy).toEqual([
      { event: "review.submitted", when: { state: "approved" }, outcome: "approved" },
      { event: "review.dismissed", outcome: "rejected" },
    ]);
  });

  it("is empty for a node with no reports", () => {
    expect(eventsOf(lineOf(), "code").answeredBy).toEqual([]);
  });
});

describe("nodeEvents, raises", () => {
  it("raises dispatch and reported for an agent station, then each outcome with the edge it takes", () => {
    expect(eventsOf(lineOf(), "code").raises).toEqual([
      { kind: "event", event: "station_run.dispatch" },
      { kind: "event", event: "station_run.reported" },
      { kind: "outcome", outcome: "success", leadsTo: { on: "success", node: "check", event: "node.check.start" } },
      { kind: "outcome", outcome: "failed", leadsTo: { on: "always", node: "done", event: "node.done.start" } },
    ]);
  });

  it("raises dispatch for a service station", () => {
    expect(eventsOf(lineOf(), "check").raises[0]).toEqual({ kind: "event", event: "station_run.dispatch" });
  });

  it("raises reported but no dispatch for a human station", () => {
    const line = lineOf({ nodes: [{ id: "code", station: "approver" }, { id: "check", station: "checker" }, { id: "done" }], edges: [{ from: "code", to: "done", on: "approved" }] });

    expect(eventsOf(line, "code").raises).toEqual([
      { kind: "event", event: "station_run.reported" },
      { kind: "outcome", outcome: "approved", leadsTo: { on: "approved", node: "done", event: "node.done.start" } },
    ]);
  });

  it("names the node's own start event when the next node names one", () => {
    const line = lineOf({ nodes: [{ id: "code", station: "coder" }, { id: "check", station: "checker", start: "ci.green" }, { id: "done" }] });

    expect(eventsOf(line, "code").raises[2]).toEqual({ kind: "outcome", outcome: "success", leadsTo: { on: "success", node: "check", event: "ci.green" } });
  });

  it("marks an outcome no edge takes with leadsTo null", () => {
    const line = lineOf({ edges: [{ from: "code", to: "check", on: "success" }, { from: "check", to: "done", on: "success" }] });

    expect(eventsOf(line, "code").raises[3]).toEqual({ kind: "outcome", outcome: "failed", leadsTo: null });
  });

  it("raises success from a marker that is not terminal", () => {
    const line = lineOf({
      nodes: [{ id: "code", station: "coder" }, { id: "gate" }, { id: "done" }],
      edges: [{ from: "code", to: "gate", on: "success" }, { from: "gate", to: "done", on: "success" }],
    });

    expect(eventsOf(line, "gate").raises).toEqual([{ kind: "outcome", outcome: "success", leadsTo: { on: "success", node: "done", event: "node.done.start" } }]);
  });

  it("raises internal.run.settled from the exit and starts the lines that wait for it, each with its when", () => {
    const waiting: CollectionLine = { id: "follow-up", body: lineOf({ start: { on: ["internal.run.settled"], when: { outcome: "success" }, args: {} } }) };
    const unrelated: CollectionLine = { id: "other", body: lineOf({ start: { on: ["issue.opened"], args: {} } }) };

    expect(eventsOf(lineOf(), "done", [waiting, unrelated]).raises).toEqual([
      { kind: "event", event: "internal.run.settled" },
      { kind: "starts-line", line: "follow-up", when: { outcome: "success" } },
    ]);
  });

  it("raises internal.run.settled from the fail node", () => {
    const line = lineOf({ fail: "broken", nodes: [{ id: "code", station: "coder" }, { id: "check", station: "checker" }, { id: "done" }, { id: "broken" }] });

    expect(eventsOf(line, "broken").raises).toEqual([{ kind: "event", event: "internal.run.settled" }]);
  });
});
