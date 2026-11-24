// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import RunGraphView from "./RunGraphView";
import { markerLine } from "./metro/line.fixtures";
import { renderGraph } from "./run-graph.test-helpers";

function drawnIds(container: HTMLElement, attribute: string) {
  return [...container.querySelectorAll(`[${attribute}]`)].map((element) => element.getAttribute(attribute)).sort();
}

function addedIds(container: HTMLElement) {
  const added = [...container.querySelectorAll("[data-change='added']")].map(
    (element) => element.getAttribute("data-node") ?? element.getAttribute("data-edge"),
  );

  return added.sort();
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

  it("draws only a and done again after pressing Whole line twice on a run that visited a and done", async () => {
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
    fireEvent.click(within(container).getByRole("button", { name: "Whole line" }));
    await waitFor(() => {
      if (!container.querySelector('[data-node="fix"]')) throw new Error("layout of fix not drawn yet");
    });
    fireEvent.click(within(container).getByRole("button", { name: "Whole line" }));
    await waitFor(() => {
      if (container.querySelector('[data-edge="a|fix|failed"]')) throw new Error("edge to fix still drawn");
    });
    await waitFor(() => {
      if (container.querySelector('[data-node="fix"]')) throw new Error("fix still fading out");
    });

    expect({ nodes: drawnIds(container, "data-node"), edges: drawnIds(container, "data-edge") }).toEqual({
      nodes: ["a", "done"],
      edges: ["a|done|success"],
    });
  });

  it("draws only a and done after pressing Whole line on a run that visited a and done when show is all", async () => {
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

    const { container } = await renderGraph(<RunGraphView definition={definition} run={run} show="all" />);
    await waitFor(() => {
      if (!container.querySelector('[data-node="fix"]')) throw new Error("whole line not drawn yet");
    });
    fireEvent.click(within(container).getByRole("button", { name: "Whole line" }));
    await waitFor(() => {
      if (container.querySelector('[data-edge="a|fix|failed"]')) throw new Error("edge to fix still drawn");
    });
    await waitFor(() => {
      if (container.querySelector('[data-node="fix"]')) throw new Error("fix still fading out");
    });

    expect({ nodes: drawnIds(container, "data-node"), edges: drawnIds(container, "data-edge") }).toEqual({
      nodes: ["a", "done"],
      edges: ["a|done|success"],
    });
  });

  it("marks fix, a|fix|failed and fix|a|always as added after pressing Whole line on a run that visited a and done", async () => {
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
    fireEvent.click(within(container).getByRole("button", { name: "Whole line" }));
    await waitFor(() => {
      if (!container.querySelector('[data-node="fix"]')) throw new Error("layout of fix not drawn yet");
    });

    expect(addedIds(container)).toEqual(["a|fix|failed", "fix", "fix|a|always"]);
  });

  it("offers no Whole line button when no run is passed", async () => {
    const definition = markerLine({
      entry: "a",
      nodeIds: ["a", "done"],
      edges: [["a", "done", "success"]],
    });

    const { container } = await renderGraph(<RunGraphView definition={definition} />);

    expect(within(container).queryByRole("button", { name: "Whole line" })).toBeNull();
  });

  it("draws the whole line and no Whole line button when show is visited but no run is passed", async () => {
    const definition = markerLine({
      entry: "a",
      nodeIds: ["a", "fix", "done"],
      edges: [
        ["a", "done", "success"],
        ["a", "fix", "failed"],
        ["fix", "a", "always"],
      ],
    });

    const { container } = await renderGraph(<RunGraphView definition={definition} show="visited" />);

    expect({
      nodes: drawnIds(container, "data-node"),
      button: within(container).queryByRole("button", { name: "Whole line" }),
    }).toEqual({ nodes: ["a", "done", "fix"], button: null });
  });

  it("draws only a and done once a run that visited a and done arrives after the graph was drawn without one", async () => {
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

    const { container, rerender } = await renderGraph(<RunGraphView definition={definition} />);
    rerender(<RunGraphView definition={definition} run={run} />);
    await waitFor(() => {
      if (container.querySelector('[data-node="fix"]')) throw new Error("fix still drawn");
    });

    expect(drawnIds(container, "data-node")).toEqual(["a", "done"]);
  });
});
