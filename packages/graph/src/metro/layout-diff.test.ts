import { describe, expect, it } from "vitest";
import type { ElkLayout } from "../elk-layout";
import { diffLayouts } from "./layout-diff";

const box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const contentBox = { minX: 0, minY: 0, maxX: 400, maxY: 100 };
const nodeA = { id: "a", x: 10, y: 20, width: 100, height: 40, ports: [] };
const nodeB = { id: "b", x: 210, y: 20, width: 100, height: 40, ports: [] };
const edgeAB = {
  from: "a",
  to: "b",
  on: "success",
  kind: "forward" as const,
  d: "M 60 20 L 160 20",
  mid: { x: 110, y: 20, vertical: false },
  labelBox: box,
};

function sortedDiff(before: ElkLayout | null, after: ElkLayout) {
  const { added, moved, removed } = diffLayouts(before, after);

  return { added: [...added].sort(), moved: [...moved].sort(), removed: [...removed].sort() };
}

describe("diffLayouts", () => {
  it("lists a new node and its new edge as added", () => {
    const before: ElkLayout = { nodes: [nodeA], edges: [], contentBox };
    const after: ElkLayout = { nodes: [nodeA, nodeB], edges: [edgeAB], contentBox };

    expect(sortedDiff(before, after)).toEqual({ added: ["a|b|success", "b"], moved: [], removed: [] });
  });

  it("lists node b and edge a-b as moved when b's x and the edge's d change", () => {
    const before: ElkLayout = { nodes: [nodeA, nodeB], edges: [edgeAB], contentBox };
    const after: ElkLayout = {
      nodes: [nodeA, { ...nodeB, x: 250 }],
      edges: [{ ...edgeAB, d: "M 60 20 L 200 20" }],
      contentBox,
    };

    expect(sortedDiff(before, after)).toEqual({ added: [], moved: ["a|b|success", "b"], removed: [] });
  });

  it("lists node b as moved when only its y changes", () => {
    const before: ElkLayout = { nodes: [nodeA, nodeB], edges: [], contentBox };
    const after: ElkLayout = { nodes: [nodeA, { ...nodeB, y: 60 }], edges: [], contentBox };

    expect(sortedDiff(before, after)).toEqual({ added: [], moved: ["b"], removed: [] });
  });

  it("lists node b and edge a-b as removed when only before has them", () => {
    const before: ElkLayout = { nodes: [nodeA, nodeB], edges: [edgeAB], contentBox };
    const after: ElkLayout = { nodes: [nodeA], edges: [], contentBox };

    expect(sortedDiff(before, after)).toEqual({ added: [], moved: [], removed: ["a|b|success", "b"] });
  });

  it("returns empty added, moved and removed when before is null", () => {
    const after: ElkLayout = { nodes: [nodeA], edges: [], contentBox };

    expect(sortedDiff(null, after)).toEqual({ added: [], moved: [], removed: [] });
  });
});
