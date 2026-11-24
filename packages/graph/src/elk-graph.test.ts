import { describe, it, expect } from "vitest";
import { elkGraphOf } from "./elk-graph";
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import { markerLine } from "./metro/line.fixtures";

describe("elkGraphOf", () => {
  it("returns the root with layout options and one 140x60 child for a single-station line", () => {
    const singleStationLine = markerLine({ entry: "review", exit: "review", nodeIds: ["review"], edges: [] });

    const graph = elkGraphOf(singleStationLine);

    expect(graph).toMatchObject({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.spacing.edgeEdge": expect.any(String),
        "elk.spacing.edgeNode": expect.any(String),
      },
      children: [
        { id: "review", width: 140, height: 60, layoutOptions: { "elk.portConstraints": "FIXED_SIDE" }, ports: [] },
      ],
      edges: [],
    });
  });

  it("returns a 160x92 child for a single-station line given a 160x92 size", () => {
    const singleStationLine = markerLine({ entry: "review", exit: "review", nodeIds: ["review"], edges: [] });

    const { children } = elkGraphOf(singleStationLine, { width: 160, height: 92 });

    expect(children?.[0]).toMatchObject({ id: "review", width: 160, height: 92 });
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
        sources: ["write|done|success:out"],
        targets: ["write|done|success:in"],
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
        sources: ["review|review|failed:out"],
        targets: ["review|review|failed:in"],
        labels: [{ text: "failed · max 1", width: 109, height: 16 }],
      },
    ]);
  });

  it("gives write -> done on success an east out-port on write and a west in-port on done", () => {
    const successLine = markerLine({
      entry: "write",
      exit: "done",
      nodeIds: ["write", "done"],
      edges: [["write", "done", "success"]],
    });
    const fixedSide = { "elk.portConstraints": "FIXED_SIDE" };

    const { children, edges } = elkGraphOf(successLine);

    expect({ children, edges }).toEqual({
      children: [
        {
          id: "write",
          width: 140,
          height: 60,
          layoutOptions: fixedSide,
          ports: [{ id: "write|done|success:out", width: 8, height: 8, layoutOptions: { "elk.port.side": "EAST" } }],
        },
        {
          id: "done",
          width: 140,
          height: 60,
          layoutOptions: fixedSide,
          ports: [{ id: "write|done|success:in", width: 8, height: 8, layoutOptions: { "elk.port.side": "WEST" } }],
        },
      ],
      edges: [
        {
          id: "write|done|success",
          sources: ["write|done|success:out"],
          targets: ["write|done|success:in"],
          labels: [{ text: "success", width: 58, height: 16 }],
        },
      ],
    });
  });

  it("ends the failed review -> done line at its own exit dot and leaves done only the success in-port", () => {
    const branchingLine = markerLine({
      entry: "review",
      exit: "done",
      nodeIds: ["review", "done"],
      edges: [
        ["review", "done", "success"],
        ["review", "done", "failed"],
      ],
    });

    const { children, edges } = elkGraphOf(branchingLine);

    expect({ children: children?.map(({ id, width, height, layoutOptions, ports }) => ({ id, width, height, layoutOptions, ports })).filter(({ id }) => id !== "review"), failedTargets: edges?.find((edge) => edge.id === "review|done|failed")?.targets }).toEqual({
      children: [
        {
          id: "done",
          width: 140,
          height: 60,
          layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
          ports: [{ id: "review|done|success:in", width: 8, height: 8, layoutOptions: { "elk.port.side": "WEST" } }],
        },
        {
          id: "review|done|failed:exit",
          width: 14,
          height: 14,
          layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
          ports: [{ id: "review|done|failed:in", width: 8, height: 8, layoutOptions: { "elk.port.side": "WEST" } }],
        },
      ],
      failedTargets: ["review|done|failed:in"],
    });
  });
});
