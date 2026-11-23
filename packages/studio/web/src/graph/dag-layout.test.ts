import { describe, it, expect } from "vitest";
import {
  layerByLongestPath,
  classifyEdges,
  layoutAssemblyLine,
} from "./dag-layout";
import {
  implementationDefinition,
  codeReviewDefinition,
  builtinDefinitions,
} from "./definition.fixtures";
import type { AssemblyLineDefinition } from "./assembly-line-definition";

const twoNodeLine: AssemblyLineDefinition = {
  name: "degenerate",
  description: "Two nodes, one edge.",
  version: 1,
  entry: "detect",
  exit: "done",
  nodes: [
    { id: "detect", type: "service" },
    { id: "done", type: "marker" },
  ],
  edges: [{ from: "detect", to: "done", on: "success" }],
};

function kindOf(
  def: AssemblyLineDefinition,
  from: string,
  to: string,
): string | undefined {
  const layers = layerByLongestPath(def);

  return classifyEdges(def, layers).find((e) => e.from === from && e.to === to)
    ?.kind;
}

function spansBoth(min: number, max: number, centre: number, half: number): boolean {
  return min <= centre - half && max >= centre + half;
}

function pathOfEdge(edges: readonly { from: string; to: string; d: string }[], edgeEnd: "to" | "from", id: string): string | undefined {
  const found = edges.find((e) => e[edgeEnd] === id);

  return found?.d;
}

function idsOf(nodes: readonly { id: string }[]): string[] {
  return nodes.map((n) => n.id).sort();
}

function yValuesOf(d: string): number[] {
  const numbers = d.match(/-?\d+(\.\d+)?/g) ?? [];

  return numbers.flatMap((value, position) => (position % 2 === 1 ? [Number(value)] : []));
}

describe("layerByLongestPath", () => {
  it("assigns layer 0 to implement and layer 5 to done for implementation", () => {
    const layers = layerByLongestPath(implementationDefinition);

    expect(Object.fromEntries(layers)).toEqual({
      implement: 0,
      validate: 1,
      push: 2,
      review: 3,
      address: 4,
      retrospective: 4,
      done: 5,
    });
  });

  it("ignores the implement-to-implement self-loop when assigning layers", () => {
    expect(layerByLongestPath(implementationDefinition).get("implement")).toBe(
      0,
    );
  });

  it("assigns layer 1 to the successor in a two-node line", () => {
    const layers = layerByLongestPath(twoNodeLine);

    expect(Object.fromEntries(layers)).toEqual({ detect: 0, done: 1 });
  });

  it("assigns layer 1 to every parallel-edge successor in code-review", () => {
    expect(
      Object.fromEntries(layerByLongestPath(codeReviewDefinition)),
    ).toEqual({ review: 0, done: 1 });
  });
});

describe("classifyEdges", () => {
  it("classifies implement-to-implement as self", () => {
    expect(kindOf(implementationDefinition, "implement", "implement")).toBe(
      "self",
    );
  });

  it("classifies validate-to-implement as back", () => {
    expect(kindOf(implementationDefinition, "validate", "implement")).toBe(
      "back",
    );
  });

  it("classifies address-to-validate as back", () => {
    expect(kindOf(implementationDefinition, "address", "validate")).toBe(
      "back",
    );
  });

  it("classifies implement-to-validate as forward", () => {
    expect(kindOf(implementationDefinition, "implement", "validate")).toBe(
      "forward",
    );
  });

  it("preserves the edge condition and iterationMax on the classified edge", () => {
    const layers = layerByLongestPath(implementationDefinition);
    const edge = classifyEdges(implementationDefinition, layers).find(
      (e) => e.from === "review" && e.to === "address",
    );

    expect(edge).toMatchObject({
      on: "changes_requested",
      iterationMax: 2,
      kind: "forward",
    });
  });
});

const chainLine: AssemblyLineDefinition = {
  name: "chain",
  description: "Four steps in a row, two loops back.",
  version: 1,
  entry: "a",
  exit: "d",
  nodes: [
    { id: "a", type: "agent" },
    { id: "b", type: "agent" },
    { id: "c", type: "agent" },
    { id: "d", type: "agent" },
  ],
  edges: [
    { from: "a", to: "b", on: "success" },
    { from: "b", to: "c", on: "success" },
    { from: "c", to: "d", on: "success" },
    { from: "d", to: "c", on: "failed" },
    { from: "c", to: "a", on: "changes_requested" },
  ],
};

const WRAP = { nodeWidth: 200, nodeHeight: 48, rowGap: 96, arcDrop: 56 };

function pointsOf(d: string): { x: number; y: number }[] {
  const numbers = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

  return numbers.flatMap((n, i) =>
    i % 2 === 0 ? [{ x: n, y: numbers[i + 1] }] : [],
  );
}

describe("layoutAssemblyLine wrapped into bands", () => {
  const wrapped = layoutAssemblyLine(chainLine, { ...WRAP, columnsPerBand: 2 });
  const at = (id: string) => wrapped.nodes.find((n) => n.id === id)!;
  const edge = (from: string, to: string) =>
    wrapped.edges.find((e) => e.from === from && e.to === to)!;

  it("starts the third step of a 2-column band on the next band, back in the first column", () => {
    expect({ x: at("c").x, band: at("c").band }).toEqual({
      x: at("a").x,
      band: 1,
    });
  });

  it("puts band 1 below band 0's nodes and the arc floor under them", () => {
    expect(at("c").y - at("a").y).toBeGreaterThan(
      WRAP.nodeHeight + WRAP.arcDrop,
    );
  });

  it("routes b → c out of b's right side, under band 0, and into c's left side", () => {
    const points = pointsOf(edge("b", "c").d);
    const halfW = WRAP.nodeWidth / 2;
    const halfH = WRAP.nodeHeight / 2;

    expect({
      start: points[0],
      end: points.at(-1),
      passesUnderBand0: points.some(
        (p) => p.y > at("b").y + halfH && p.y < at("c").y - halfH,
      ),
    }).toEqual({
      start: { x: at("b").x + halfW, y: at("b").y },
      end: { x: at("c").x - halfW, y: at("c").y },
      passesUnderBand0: true,
    });
  });

  it("turns the label of a retry that climbs the left gutter to read along it", () => {
    expect(edge("c", "a").mid.vertical).toBe(true);
  });

  it("keeps the d → c retry inside band 1, below its nodes", () => {
    const ys = pointsOf(edge("d", "c").d).map((p) => p.y);

    expect({
      belowBand1: Math.max(...ys) > at("c").y + WRAP.nodeHeight / 2,
      neverAboveBand1: Math.min(...ys) >= at("c").y - WRAP.nodeHeight / 2,
    }).toEqual({ belowBand1: true, neverAboveBand1: true });
  });

  it("routes the c → a restart up the left gutter into a's underside", () => {
    const points = pointsOf(edge("c", "a").d);

    expect({
      end: points.at(-1),
      usesLeftGutter: points.some((p) => p.x < at("a").x - WRAP.nodeWidth / 2),
    }).toEqual({
      end: { x: at("a").x, y: at("a").y + WRAP.nodeHeight / 2 },
      usesLeftGutter: true,
    });
  });

  it("keeps every node on one band when no column count is given", () => {
    const flat = layoutAssemblyLine(chainLine, WRAP);

    expect(new Set(flat.nodes.map((n) => n.y)).size).toBe(1);
  });
});

describe("layoutAssemblyLine", () => {
  it("returns a non-zero-length path for the implement self-loop", () => {
    const loop = layoutAssemblyLine(implementationDefinition).edges.find(
      (e) => e.kind === "self",
    );
    const points = loop?.d.match(/-?\d+(\.\d+)?/g) ?? [];

    expect([loop?.d.includes("C"), new Set(points).size > 2]).toEqual([true, true]);
  });

  it("routes the validate-to-implement back-edge below the node row", () => {
    const layout = layoutAssemblyLine(implementationDefinition);
    const back = layout.edges.find(
      (e) => e.from === "validate" && e.to === "implement",
    );
    const lowestNode = Math.max(...layout.nodes.map((n) => n.y));

    expect(Math.max(...yValuesOf(back?.d ?? ""))).toBeGreaterThan(lowestNode);
  });

  it("keeps every forward-edge path within the node row", () => {
    const layout = layoutAssemblyLine(implementationDefinition);
    const lowestNode = Math.max(...layout.nodes.map((n) => n.y));

    for (const edge of layout.edges.filter((e) => e.kind === "forward")) {
      expect(Math.max(...yValuesOf(edge.d))).toBeLessThanOrEqual(lowestNode);
    }
  });

  it("returns identical output for two calls with the same definition", () => {
    expect(layoutAssemblyLine(implementationDefinition)).toEqual(
      layoutAssemblyLine(implementationDefinition),
    );
  });

  it("draws a lone forward edge level between the facing node ports", () => {
    const edge = layoutAssemblyLine(twoNodeLine).edges.find(
      (e) => e.kind === "forward",
    );

    expect(new Set(yValuesOf(edge?.d ?? "")).size).toBe(1);
  });

  it("puts the label of a lone forward edge midway between the facing node ports", () => {
    const layout = layoutAssemblyLine(twoNodeLine, { nodeWidth: 100, layerGap: 200 });
    const [detect, done] = layout.nodes;
    const edge = layout.edges[0];

    expect(edge.mid).toEqual({ x: (detect.x + 50 + done.x - 50) / 2, y: detect.y, vertical: false });
  });

  it("puts the label of a self-loop above its node and of a back-edge below it", () => {
    const layout = layoutAssemblyLine(implementationDefinition);
    const nodeY = Object.fromEntries(layout.nodes.map((n) => [n.id, n.y]));
    const labelY = Object.fromEntries(layout.edges.map((e) => [`${e.from}->${e.to}`, e.mid.y]));

    expect({ selfAbove: labelY["implement->implement"] < nodeY.implement, backBelow: labelY["validate->implement"] > nodeY.implement }).toEqual({ selfAbove: true, backBelow: true });
  });

  it("places a node at x proportional to its layer", () => {
    const layout = layoutAssemblyLine(twoNodeLine, { layerGap: 100 });
    const positions = Object.fromEntries(layout.nodes.map((n) => [n.id, n.x]));

    expect(positions.done - positions.detect).toBe(100);
  });

  it("assigns every node of every builtin definition a distinct position", () => {
    const placed = builtinDefinitions.map((def) => {
      const layout = layoutAssemblyLine(def);

      return {
        distinct: new Set(layout.nodes.map((n) => `${n.x},${n.y}`)).size === def.nodes.length,
        ids: idsOf(layout.nodes),
        expected: idsOf(def.nodes),
      };
    });

    expect(placed.map(({ distinct, ids, expected }) => distinct && ids.join() === expected.join())).toEqual(builtinDefinitions.map(() => true));
  });

  it("returns a canvas large enough to contain every node and back-edge arc", () => {
    const layout = layoutAssemblyLine(implementationDefinition);

    expect([layout.width > Math.max(...layout.nodes.map((n) => n.x)), layout.height > Math.max(...layout.nodes.map((n) => n.y))]).toEqual([true, true]);
  });

  it("lays out an unreachable node and empties the path of a dangling edge", () => {
    const malformed: AssemblyLineDefinition = {
      ...twoNodeLine,
      nodes: [...twoNodeLine.nodes, { id: "orphan", type: "service" }],
      edges: [
        ...twoNodeLine.edges,
        { from: "orphan", to: "ghost", on: "always" },
        { from: "phantom", to: "done", on: "always" },
      ],
    };
    const layout = layoutAssemblyLine(malformed);

    const pathOf = (edgeEnd: "to" | "from", id: string) => pathOfEdge(layout.edges, edgeEnd, id);

    expect({
      orphanLaidOut: idsOf(layout.nodes).includes("orphan"),
      toGhost: pathOf("to", "ghost"),
      fromPhantom: pathOf("from", "phantom"),
      doneLayer: layerByLongestPath(malformed).get("done"),
    }).toEqual({ orphanLaidOut: true, toGhost: "", fromPhantom: "", doneLayer: 1 });
  });

  it("emits one layout edge per definition edge", () => {
    expect(builtinDefinitions.map((def) => layoutAssemblyLine(def).edges.length)).toEqual(builtinDefinitions.map((def) => def.edges.length));
  });

  it("returns a content box that contains every node box", () => {
    const layout = layoutAssemblyLine(implementationDefinition);
    const halfW = 132 / 2;
    const halfH = 48 / 2;

    const { contentBox } = layout;
    const contained = layout.nodes.map((node) => spansBoth(contentBox.minX, contentBox.maxX, node.x, halfW) && spansBoth(contentBox.minY, contentBox.maxY, node.y, halfH));

    expect(contained).toEqual(layout.nodes.map(() => true));
  });

  it("returns a content box tight to a single node rather than the layer grid", () => {
    const { contentBox } = layoutAssemblyLine(twoNodeLine);
    const spanX = contentBox.maxX - contentBox.minX;

    expect([spanX < layoutAssemblyLine(twoNodeLine).width, spanX > 0]).toEqual([true, true]);
  });
});
