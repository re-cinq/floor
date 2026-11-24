// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { waitFor } from "@testing-library/react";
import RunGraphView from "./RunGraphView";
import { markerLine } from "./metro/line.fixtures";
import { renderGraph } from "./run-graph.test-helpers";

function addedKeys(container: HTMLElement) {
  const added = [...container.querySelectorAll("[data-change='added']")].map(
    (element) => element.getAttribute("data-node") ?? element.getAttribute("data-edge"),
  );

  return added.sort();
}

describe("RunGraphView change marking", () => {
  it("marks b, a|b|success and b|done|success as added when b is inserted between a and done", async () => {
    const before = markerLine({ entry: "a", nodeIds: ["a", "done"], edges: [["a", "done", "success"]] });
    const after = markerLine({
      entry: "a",
      nodeIds: ["a", "b", "done"],
      edges: [
        ["a", "b", "success"],
        ["b", "done", "success"],
      ],
    });

    const { container, rerender } = await renderGraph(<RunGraphView definition={before} />);
    rerender(<RunGraphView definition={after} />);
    await waitFor(() => {
      if (!container.querySelector("[data-node=\"b\"]")) throw new Error("layout of b not drawn yet");
    });

    expect(addedKeys(container)).toEqual(["a|b|success", "b", "b|done|success"]);
  });
});
