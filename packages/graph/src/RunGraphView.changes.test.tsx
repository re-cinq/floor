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

function drawnNodeIds(container: HTMLElement) {
  const nodes = [...container.querySelectorAll("[data-node]")].map((element) => element.getAttribute("data-node"));

  return nodes.sort();
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

  it("clears the added marks when a later layout adds nothing", async () => {
    const before = markerLine({ entry: "a", nodeIds: ["a", "done"], edges: [["a", "done", "success"]] });
    const withB = markerLine({
      entry: "a",
      nodeIds: ["a", "b", "done"],
      edges: [
        ["a", "b", "success"],
        ["b", "done", "success"],
      ],
    });
    const withBRenamedEntry = markerLine({
      entry: "b",
      nodeIds: ["a", "b", "done"],
      edges: [
        ["a", "b", "success"],
        ["b", "done", "success"],
      ],
    });

    const { container, rerender } = await renderGraph(<RunGraphView definition={before} />);
    rerender(<RunGraphView definition={withB} />);
    await waitFor(() => {
      if (addedKeys(container).length === 0) throw new Error("added marks not drawn yet");
    });
    rerender(<RunGraphView definition={withBRenamedEntry} />);
    await waitFor(() => {
      if (addedKeys(container).length !== 0) throw new Error("added marks not cleared yet");
    });

    expect(addedKeys(container)).toEqual([]);
  });

  it("marks done as moved when b is inserted between a and done", async () => {
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

    expect(container.querySelector("[data-node=\"done\"]")?.getAttribute("data-change")).toBe("moved");
  });

  it("draws done offset back to its old column when b is inserted between a and done", async () => {
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
      if (container.querySelector("[data-node=\"done\"]")?.getAttribute("data-change") !== "moved") throw new Error("done not marked moved yet");
    });

    expect((container.querySelector("[data-node=\"done\"]") as HTMLElement).style.transform).toMatch(
      /^translate\(-\d+(\.\d+)?px(, -?\d+(\.\d+)?px)?\)$/,
    );
  });

  it("clears the offset of done on the next frame and keeps it marked moved", async () => {
    const before = markerLine({ entry: "a", nodeIds: ["a", "done"], edges: [["a", "done", "success"]] });
    const after = markerLine({
      entry: "a",
      nodeIds: ["a", "b", "done"],
      edges: [
        ["a", "b", "success"],
        ["b", "done", "success"],
      ],
    });
    const doneEl = () => container.querySelector("[data-node=\"done\"]") as HTMLElement;

    const { container, rerender } = await renderGraph(<RunGraphView definition={before} />);
    rerender(<RunGraphView definition={after} />);
    await waitFor(() => {
      if (!doneEl().style.transform) throw new Error("done not offset yet");
    });
    await waitFor(() => {
      if (doneEl().style.transform) throw new Error("offset of done not cleared yet");
    });

    expect({ change: doneEl().getAttribute("data-change"), transform: doneEl().style.transform }).toEqual({
      change: "moved",
      transform: "",
    });
  });

  it("marks nothing as added on the first draw", async () => {
    const definition = markerLine({ entry: "a", nodeIds: ["a", "done"], edges: [["a", "done", "success"]] });

    const { container } = await renderGraph(<RunGraphView definition={definition} />);
    await waitFor(() => {
      if (!container.querySelector("[data-node=\"done\"]")) throw new Error("layout not drawn yet");
    });

    expect(addedKeys(container)).toEqual([]);
  });

  it("leaves a, which did not move, without an offset or a change mark when b is inserted between a and done", async () => {
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
      if (container.querySelector('[data-node="done"]')?.getAttribute("data-change") !== "moved") throw new Error("done not marked moved yet");
    });
    const a = container.querySelector<HTMLElement>('[data-node="a"]');

    expect({ change: a?.getAttribute("data-change"), transform: a?.style.transform }).toEqual({ change: null, transform: "" });
  });

  it("keeps b drawn as removed when b is dropped from a to b to done", async () => {
    const before = markerLine({
      entry: "a",
      nodeIds: ["a", "b", "done"],
      edges: [
        ["a", "b", "success"],
        ["b", "done", "success"],
      ],
    });
    const after = markerLine({ entry: "a", nodeIds: ["a", "done"], edges: [["a", "done", "success"]] });

    const { container, rerender } = await renderGraph(<RunGraphView definition={before} />);
    rerender(<RunGraphView definition={after} />);
    await waitFor(() => {
      if (!container.querySelector("[data-edge=\"a|done|success\"]")) throw new Error("a to done not drawn yet");
    });

    expect(container.querySelector("[data-node=\"b\"]")?.getAttribute("data-change")).toBe("removed");
  });

  it("drops b from the drawing once its fade is over when b is removed from a to b to done", async () => {
    const before = markerLine({
      entry: "a",
      nodeIds: ["a", "b", "done"],
      edges: [
        ["a", "b", "success"],
        ["b", "done", "success"],
      ],
    });
    const after = markerLine({ entry: "a", nodeIds: ["a", "done"], edges: [["a", "done", "success"]] });

    const { container, rerender } = await renderGraph(<RunGraphView definition={before} />);
    rerender(<RunGraphView definition={after} />);
    await waitFor(() => {
      if (!container.querySelector("[data-edge=\"a|done|success\"]")) throw new Error("a to done not drawn yet");
    });
    await waitFor(() => {
      if (container.querySelector("[data-node=\"b\"]")) throw new Error("b still drawn");
    });

    expect(drawnNodeIds(container)).toEqual(["a", "done"]);
  });
});
