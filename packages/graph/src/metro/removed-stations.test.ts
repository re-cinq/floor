import { describe, expect, it } from "vitest";
import type { ElkLayout } from "../elk-layout";
import type { VisibleNode } from "../graph-view-model";
import { removedStationsOf } from "./removed-stations";

const contentBox = { minX: 0, minY: 0, maxX: 400, maxY: 100 };
const nodeA = { id: "a", x: 10, y: 20, width: 100, height: 40, ports: [] };
const nodeB = { id: "b", x: 210, y: 20, width: 100, height: 40, ports: [] };

function modelOf(id: string): VisibleNode {
  return { id, type: "agent", outcomes: [], isEntry: false, isExit: false, isFail: false, hasProblem: false };
}

const layoutOf = (...nodes: ElkLayout["nodes"]): ElkLayout => ({ nodes, edges: [], contentBox });

describe("removedStationsOf", () => {
  it("returns node b with its model when only the earlier layout has it", () => {
    const graph = { nodes: [modelOf("a"), modelOf("b")], edges: [] };

    expect(removedStationsOf({ layout: layoutOf(nodeA, nodeB), graph }, layoutOf(nodeA))).toEqual([
      { node: nodeB, model: modelOf("b") },
    ]);
  });

  it("returns nothing when both layouts have the same stations", () => {
    const graph = { nodes: [modelOf("a")], edges: [] };

    expect(removedStationsOf({ layout: layoutOf(nodeA), graph }, layoutOf(nodeA))).toEqual([]);
  });

  it("skips a removed node the earlier graph has no model for", () => {
    const graph = { nodes: [modelOf("a")], edges: [] };

    expect(removedStationsOf({ layout: layoutOf(nodeA, nodeB), graph }, layoutOf(nodeA))).toEqual([]);
  });
});
