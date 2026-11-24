// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import RunGraphView from "./RunGraphView";
import { markerLine } from "./metro/line.fixtures";
import { renderGraph } from "./run-graph.test-helpers";

function drawnIds(container: HTMLElement, attribute: string) {
  return [...container.querySelectorAll(`[${attribute}]`)].map((element) => element.getAttribute(attribute)).sort();
}

describe("RunGraphView visited-only drawing", () => {
  it("draws only a, done and a|done|success when a run closed a in success and visited done", async () => {
    const definition = markerLine({
      entry: "a",
      nodeIds: ["a", "fix", "done"],
      edges: [
        ["a", "done", "success"],
        ["a", "fix", "failed"],
        ["fix", "a", "always"],
      ],
    });
    const run = {
      visits: [
        { nodeId: "a", iteration: 1, outcome: "success", open: false },
        { nodeId: "done", iteration: 1, outcome: "success", open: false },
      ],
    };

    const { container } = await renderGraph(<RunGraphView definition={definition} run={run} />);

    expect({ nodes: drawnIds(container, "data-node"), edges: drawnIds(container, "data-edge") }).toEqual({
      nodes: ["a", "done"],
      edges: ["a|done|success"],
    });
  });

  it("draws a, done, fix and all three edges after pressing Whole line on a run that visited a and done", async () => {
    const definition = markerLine({
      entry: "a",
      nodeIds: ["a", "fix", "done"],
      edges: [
        ["a", "done", "success"],
        ["a", "fix", "failed"],
        ["fix", "a", "always"],
      ],
    });
    const run = {
      visits: [
        { nodeId: "a", iteration: 1, outcome: "success", open: false },
        { nodeId: "done", iteration: 1, outcome: "success", open: false },
      ],
    };

    const { container } = await renderGraph(<RunGraphView definition={definition} run={run} />);
    fireEvent.click(screen.getByRole("button", { name: "Whole line" }));
    await waitFor(() => {
      if (!container.querySelector('[data-node="fix"]')) throw new Error("layout of fix not drawn yet");
    });

    expect({ nodes: drawnIds(container, "data-node"), edges: drawnIds(container, "data-edge") }).toEqual({
      nodes: ["a", "done", "fix"],
      edges: ["a|done|success", "a|fix|failed", "fix|a|always"],
    });
  });
});
