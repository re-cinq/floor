import { describe, it, expect } from "vitest";
import { elkGraphOf } from "./elk-graph";
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import { markerLine } from "./metro/line.fixtures";

describe("elkGraphOf", () => {
  it("returns the root with layout options and one 140x60 child for a single-station line", () => {
    const singleStationLine = markerLine({ entry: "review", exit: "review", nodeIds: ["review"], edges: [] });

    expect(elkGraphOf(singleStationLine)).toEqual({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      },
      children: [{ id: "review", width: 140, height: 60 }],
      edges: [],
    });
  });

  it("returns one edge with a 58x16 success label for write -> done on success", () => {
    const twoStationLine: AssemblyLineDefinition = {
      name: "pair",
      description: "Two stations.",
      version: 1,
      entry: "write",
      exit: "done",
      nodes: [
        { id: "write", type: "marker" },
        { id: "done", type: "marker" },
      ],
      edges: [{ from: "write", to: "done", on: "success" }],
    };

    expect(elkGraphOf(twoStationLine).edges).toEqual([
      {
        id: "write|done|success",
        sources: ["write"],
        targets: ["done"],
        labels: [{ text: "success", width: 58, height: 16 }],
      },
    ]);
  });

  it("returns a 109x16 'failed · max 1' label for review -> review on failed with iterationMax 1", () => {
    const loopingLine: AssemblyLineDefinition = {
      name: "loop",
      description: "One station looping on itself.",
      version: 1,
      entry: "review",
      exit: "review",
      nodes: [{ id: "review", type: "marker" }],
      edges: [{ from: "review", to: "review", on: "failed", iterationMax: 1 }],
    };

    expect(elkGraphOf(loopingLine).edges).toEqual([
      {
        id: "review|review|failed",
        sources: ["review"],
        targets: ["review"],
        labels: [{ text: "failed · max 1", width: 109, height: 16 }],
      },
    ]);
  });
});
