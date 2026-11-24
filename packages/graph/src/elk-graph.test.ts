import { describe, it, expect } from "vitest";
import { elkGraphOf, type ElkGraphOptions } from "./elk-graph";
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import { codeReviewDefinition, implementationDefinition } from "./definition.fixtures";
import { nodeTitle } from "./node-tooltip";
import { markerLine } from "./metro/line.fixtures";

describe("elkGraphOf", () => {
  it("returns the root with layout options and one 140x60 child for a single-station line", () => {
    const singleStationLine = markerLine({ kind: "agent", entry: "review", exit: "review", nodeIds: ["review"], edges: [] });

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
    const singleStationLine = markerLine({ kind: "agent", entry: "review", exit: "review", nodeIds: ["review"], edges: [] });

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
      kind: "agent",
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
      kind: "agent",
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

  it("sizes the done marker 22x60 and the review agent 216x60 for the code-review line at 216x60", () => {
    const { children } = elkGraphOf(codeReviewDefinition, { width: 216, height: 60 });

    expect(
      children?.filter(({ id }) => id === "review" || id === "done").map(({ id, width, height }) => ({ id, width, height })),
    ).toEqual([
      { id: "review", width: 216, height: 60 },
      { id: "done", width: 22, height: 60 },
    ]);
  });

  it("sizes write 216, the long-id station 300 and the done marker 22 when widthOf names each card", () => {
    const mixedLine: AssemblyLineDefinition = {
      ...markerLine({ entry: "write", nodeIds: [], edges: [] }),
      nodes: [
        { id: "write", type: "agent" },
        { id: "a-very-long-station-id", type: "agent" },
        { id: "done", type: "marker" },
      ],
      edges: [
        { from: "write", to: "a-very-long-station-id", on: "success" },
        { from: "a-very-long-station-id", to: "done", on: "success" },
      ],
    };

    const { children } = elkGraphOf(mixedLine, { width: 216, height: 60, widthOf: (id) => (id === "write" ? 216 : 300) });

    expect(children?.filter(({ id }) => !id.endsWith(":exit")).map(({ id, width }) => ({ id, width }))).toEqual([
      { id: "write", width: 216 },
      { id: "a-very-long-station-id", width: 300 },
      { id: "done", width: 22 },
    ]);
  });

  it("turns the pass-through push station into a stop node with west and east ports at its centre when compactStops is on", () => {
    const stopWidth = Math.max(32, Math.ceil(nodeTitle("push").length * 6.8 + 10));

    const { children } = elkGraphOf(implementationDefinition, { width: 216, height: 60 }, { compactStops: true });

    expect(children?.find(({ id }) => id === "push")).toEqual({
      id: "push",
      width: stopWidth,
      height: 46,
      layoutOptions: { "elk.portConstraints": "FIXED_POS" },
      ports: [
        { id: "validate|push|success:in", x: 0, y: 14, width: 0, height: 0 },
        { id: "push|review|always:out", x: stopWidth, y: 14, width: 0, height: 0 },
      ],
    });
  });

  it("widens the a|fix|failed label box when the run took it twice", () => {
    const loopLine = markerLine({
      entry: "a",
      nodeIds: ["a", "fix"],
      edges: [
        ["a", "fix", "failed"],
        ["fix", "a", "always"],
      ],
    });

    const labelWidthOf = (options: ElkGraphOptions) => {
      const [firstEdge] = elkGraphOf(loopLine, undefined, options).edges ?? [];
      const [label] = firstEdge.labels ?? [];

      return label.width ?? 0;
    };

    expect(labelWidthOf({ takenCounts: new Map([["a|fix|failed", 2]]) })).toBeGreaterThan(labelWidthOf({}));
  });
});
