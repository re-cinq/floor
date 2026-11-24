import { describe, it, expect } from "vitest";
import { resolveSelection } from "./resolve-selection";
import type { CollectionView, LineView, NodeView } from "@protocol";

const nodeOf = (id: string): NodeView => ({ id, outcomes: [], needs: [], produces: [], events: { startedBy: [], answeredBy: [], raises: [] } });
const lineOf = (id: string, nodeIds: string[]): LineView => ({ id, file: `${id}/assembly-line.yaml`, entry: nodeIds[0], exit: nodeIds[0], args: {}, nodes: nodeIds.map(nodeOf), edges: [], problems: [] });
const collection: CollectionView = {
  lines: [lineOf("flow", ["work", "done"]), lineOf("other", ["start"])],
  agents: [],
  refused: [],
  counts: { lines: 2, agents: 0, refused: 0, problems: 0 },
};

describe("resolveSelection", () => {
  it("finds the line and the node the selection names", () => {
    const [flow] = collection.lines;
    const [work] = flow.nodes;

    expect(resolveSelection(collection, { line: "flow", node: "work" })).toEqual({ line: flow, node: work });
  });

  it("finds the line alone when no node is named", () => {
    expect(resolveSelection(collection, { line: "other" })).toEqual({ line: collection.lines[1], node: undefined });
  });

  it("keeps the line and drops a node the line no longer has", () => {
    expect(resolveSelection(collection, { line: "flow", node: "gone" })).toEqual({ line: collection.lines[0], node: undefined });
  });

  it("finds nothing for a line the collection no longer has, however the node is named", () => {
    expect(resolveSelection(collection, { line: "gone", node: "work" })).toEqual({ line: undefined, node: undefined });
  });

  it("finds nothing before the collection has arrived", () => {
    expect(resolveSelection(null, { line: "flow", node: "work" })).toEqual({ line: undefined, node: undefined });
  });

  it("finds the edge the review|done|failed key names, with no node selected", () => {
    const reviewed = { ...lineOf("flow", ["review", "done"]), edges: [{ from: "review", to: "done", on: "passed" }, { from: "review", to: "done", on: "failed" }] };
    const reviewedCollection = { ...collection, lines: [reviewed] };

    expect(resolveSelection(reviewedCollection, { line: "flow", node: "review", edge: "review|done|failed" })).toEqual({
      line: reviewed,
      node: undefined,
      edge: { from: "review", to: "done", on: "failed" },
    });
  });
});
