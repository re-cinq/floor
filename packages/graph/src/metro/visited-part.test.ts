import { describe, it, expect } from "vitest";
import { visitedPartOf } from "./visited-part";
import { markerLine } from "./line.fixtures";
import { edgeKeyOf } from "./edge-key";

const startToDoneLine = markerLine({
  entry: "start",
  exit: "done",
  nodeIds: ["start", "a", "done"],
  edges: [
    ["start", "a", "always"],
    ["a", "done", "success"],
  ],
});

describe("visitedPartOf", () => {
  it("keeps the start entry and its taken line start|a|always when the run never visited start", () => {
    const definition = markerLine({
      entry: "start",
      exit: "done",
      nodeIds: ["start", "a", "fix", "done"],
      edges: [
        ["start", "a", "always"],
        ["a", "done", "success"],
        ["a", "fix", "failed"],
      ],
    });

    const { entry, nodes, edges } = visitedPartOf(definition, [
      { nodeId: "a", iteration: 1, outcome: "success", open: false },
    ]);

    expect({
      entry,
      nodes: nodes.map((node) => node.id).sort(),
      edges: edges.map(edgeKeyOf).sort(),
    }).toEqual({
      entry: "start",
      nodes: ["a", "done", "start"],
      edges: ["a|done|success", "start|a|always"],
    });
  });

  it("sets exit to an empty string when the run never reached done", () => {
    const { exit } = visitedPartOf(startToDoneLine, [{ nodeId: "a", iteration: 1, outcome: "failed", open: false }]);

    expect(exit).toEqual("");
  });

  it("keeps exit as done when the run reached done", () => {
    const { exit } = visitedPartOf(startToDoneLine, [
      { nodeId: "a", iteration: 1, outcome: "success", open: false },
      { nodeId: "done", iteration: 1, outcome: "success", open: false },
    ]);

    expect(exit).toEqual("done");
  });
});
