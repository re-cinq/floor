// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { fireEvent } from "@testing-library/react";
import RunGraphView from "./RunGraphView";
import { markerLine } from "./metro/line.fixtures";
import { nodeEl, renderGraph } from "./run-graph.test-helpers";

async function renderDimmingLine() {
  const definition = markerLine({
    entry: "a",
    exit: "b",
    nodeIds: ["a", "b", "x", "y"],
    edges: [
      ["a", "b", "success"],
      ["x", "y", "success"],
    ],
    kind: "agent",
  });

  return renderGraph(<RunGraphView definition={definition} />);
}

function sortedDimmed(container: HTMLElement) {
  const dimmed = [...container.querySelectorAll("[data-dim='true']")].map((element) => ({
    node: element.getAttribute("data-node"),
    edge: element.getAttribute("data-edge"),
  }));

  return dimmed.sort((left, right) => `${left.node}${left.edge}`.localeCompare(`${right.node}${right.edge}`));
}

const outsideNeighbourhoodOfA = [
  { node: null, edge: "x|y|success" },
  { node: "x", edge: null },
  { node: "y", edge: null },
];

describe("RunGraphView neighbourhood dimming", () => {
  it("dims x, y and x|y|success when the pointer enters a, leaving a and b lit", async () => {
    const { container } = await renderDimmingLine();

    fireEvent.pointerEnter(nodeEl(container, "a"));

    expect(sortedDimmed(container)).toEqual(outsideNeighbourhoodOfA);
  });

  it("dims nothing when the pointer enters a and then leaves a", async () => {
    const { container } = await renderDimmingLine();

    fireEvent.pointerEnter(nodeEl(container, "a"));
    fireEvent.pointerLeave(nodeEl(container, "a"));

    expect(sortedDimmed(container)).toEqual([]);
  });

  it("dims x, y and x|y|success when a is focused, leaving a and b lit", async () => {
    const { container } = await renderDimmingLine();

    fireEvent.focus(nodeEl(container, "a"));

    expect(sortedDimmed(container)).toEqual(outsideNeighbourhoodOfA);
  });

  it("dims nothing when a is focused and then blurred", async () => {
    const { container } = await renderDimmingLine();

    fireEvent.focus(nodeEl(container, "a"));
    fireEvent.blur(nodeEl(container, "a"));

    expect(sortedDimmed(container)).toEqual([]);
  });
});
