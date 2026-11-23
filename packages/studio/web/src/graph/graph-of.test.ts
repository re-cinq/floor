import { describe, it, expect } from "vitest";
import { graphOf } from "./graph-of";
import { deriveVisibleGraph } from "@re-cinq/floor-graph";
import type { LineView, NodeView } from "@protocol";

const noEvents = { startedBy: [], answeredBy: [], raises: [] };

const nodeOf = (id: string, over: Partial<NodeView> = {}): NodeView => ({ id, outcomes: [], needs: [], produces: [], events: noEvents, ...over });

const line = (over: Partial<LineView> = {}): LineView => ({
  id: "flow",
  file: "flow/assembly-line.yaml",
  entry: "work",
  exit: "done",
  args: {},
  nodes: [nodeOf("work", { station: "worker", kind: "agent", description: "Works." }), nodeOf("done")],
  edges: [{ from: "work", to: "done", on: "success" }],
  problems: [],
  ...over,
});

describe("graphOf", () => {
  it("names the definition after the line and carries its entry, exit and fail node", () => {
    expect(graphOf(line({ fail: "done" }))).toMatchObject({ name: "flow", entry: "work", exit: "done", fail: "done" });
  });

  it("files a node under the kind of its station, and a node with no station as a marker", () => {
    const kinds = line({
      nodes: [nodeOf("a", { station: "x", kind: "agent" }), nodeOf("b", { station: "y", kind: "service" }), nodeOf("c", { station: "z", kind: "human" }), nodeOf("d")],
    });

    expect(graphOf(kinds).nodes.map(({ type }) => type)).toEqual(["agent", "service", "human", "marker"]);
  });

  it("carries the station name and description on the node", () => {
    expect(graphOf(line()).nodes[0]).toMatchObject({ id: "work", station: "worker", description: "Works." });
  });

  it("carries the fanout of a node", () => {
    const fanning = line({ nodes: [nodeOf("work", { fanout: { over: "items", to: "done" } }), nodeOf("done")] });

    const [work] = graphOf(fanning).nodes;

    expect(work.fanout).toEqual({ over: "items", to: "done" });
  });

  it("names the outside event that starts a node, and none for a node the walk or the line's start raises", () => {
    const events = line({
      nodes: [
        nodeOf("work", { events: { ...noEvents, startedBy: [{ event: "node.work.start", origin: "walk" }, { event: "pr.opened", origin: "line-start" }] } }),
        nodeOf("done", { events: { ...noEvents, startedBy: [{ event: "payment.settled", origin: "outside" }] } }),
      ],
    });

    expect(graphOf(events).nodes.map(({ outsideStart }) => outsideStart)).toEqual([undefined, "payment.settled"]);
  });

  it("marks only the node a problem names", () => {
    const problematic = line({ problems: [{ rule: "dead-end", node: "done", message: "done has no outgoing edge" }, { rule: "folder-name", message: "wrong folder" }] });

    expect(graphOf(problematic).nodes.map(({ hasProblem }) => hasProblem)).toEqual([false, true]);
  });

  it("carries each edge with its outcome and its iteration cap", () => {
    const looping = line({ edges: [{ from: "work", to: "done", on: "success" }, { from: "work", to: "work", on: "failed", iterationMax: 3 }] });

    expect(graphOf(looping).edges).toEqual([
      { from: "work", to: "done", on: "success" },
      { from: "work", to: "work", on: "failed", iterationMax: 3 },
    ]);
  });

  it("draws success ok, failed err, changes_requested warn and any other outcome neutral", () => {
    const outcomes = ["success", "failed", "changes_requested", "approved"];
    const branching = line({
      nodes: [nodeOf("work"), ...outcomes.map((outcome) => nodeOf(outcome))],
      edges: outcomes.map((outcome) => ({ from: "work", to: outcome, on: outcome })),
    });

    expect(deriveVisibleGraph(graphOf(branching)).edges.map(({ to, tone }) => [to, tone])).toEqual([
      ["success", "ok"],
      ["failed", "err"],
      ["changes_requested", "warn"],
      ["approved", "neutral"],
    ]);
  });
});
