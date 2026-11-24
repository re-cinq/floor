// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { fireEvent } from "@testing-library/react";
import RunGraphView from "./RunGraphView";
import { markerLine } from "./metro/line.fixtures";
import { nodeEl, renderGraph } from "./run-graph.test-helpers";

async function renderBranchingLine() {
  const definition = markerLine({
    entry: "a",
    nodeIds: ["a", "b", "done", "fix"],
    edges: [
      ["a", "b", "success"],
      ["b", "done", "success"],
      ["a", "fix", "failed"],
    ],
  });

  return renderGraph(<RunGraphView definition={definition} onSelectNode={() => undefined} />);
}

async function renderThreeLineStation() {
  const definition = markerLine({
    entry: "a",
    nodeIds: ["a", "b", "done", "fix"],
    edges: [
      ["a", "b", "success"],
      ["a", "fix", "failed"],
      ["a", "done", "timeout"],
    ],
  });

  return renderGraph(<RunGraphView definition={definition} onSelectNode={() => undefined} />);
}

const chosenKeys = (container: HTMLElement) => [...container.querySelectorAll("[data-chosen]")].map((element) => element.getAttribute("data-edge"));

describe("RunGraphView keyboard path", () => {
  it("chooses a|b|success, the first out-line of a, when a takes focus", async () => {
    const { container } = await renderBranchingLine();

    fireEvent.focus(nodeEl(container, "a"));

    expect(chosenKeys(container)).toEqual(["a|b|success"]);
  });

  it("chooses a|fix|failed, the second out-line of a, when ArrowDown is pressed on a", async () => {
    const { container } = await renderBranchingLine();

    fireEvent.focus(nodeEl(container, "a"));
    fireEvent.keyDown(nodeEl(container, "a"), { key: "ArrowDown" });

    expect(chosenKeys(container)).toEqual(["a|fix|failed"]);
  });

  it("moves DOM focus to the fix station when ArrowRight is pressed on the chosen a|fix|failed line", async () => {
    const { container } = await renderBranchingLine();

    fireEvent.focus(nodeEl(container, "a"));
    fireEvent.keyDown(nodeEl(container, "a"), { key: "ArrowDown" });
    fireEvent.keyDown(nodeEl(container, "a"), { key: "ArrowRight" });

    expect(document.activeElement).toBe(nodeEl(container, "fix"));
  });

  it("returns focus to a with a|fix|failed chosen when ArrowLeft is pressed on fix", async () => {
    const { container } = await renderBranchingLine();

    fireEvent.focus(nodeEl(container, "fix"));
    fireEvent.keyDown(nodeEl(container, "fix"), { key: "ArrowLeft" });

    expect({ focused: document.activeElement?.getAttribute("data-node"), chosen: chosenKeys(container) }).toEqual({ focused: "a", chosen: ["a|fix|failed"] });
  });

  it("chooses a|done|timeout, the last of three out-lines of a, when ArrowUp is pressed with the first chosen", async () => {
    const { container } = await renderThreeLineStation();

    fireEvent.focus(nodeEl(container, "a"));
    fireEvent.keyDown(nodeEl(container, "a"), { key: "ArrowUp" });

    expect(chosenKeys(container)).toEqual(["a|done|timeout"]);
  });

  it("prevents the default of ArrowDown but not of x, and x leaves a|fix|failed chosen", async () => {
    const { container } = await renderBranchingLine();

    fireEvent.focus(nodeEl(container, "a"));
    const arrowHandled = fireEvent.keyDown(nodeEl(container, "a"), { key: "ArrowDown" });
    const letterHandled = fireEvent.keyDown(nodeEl(container, "a"), { key: "x" });

    expect({ arrowHandled, letterHandled, chosen: chosenKeys(container) }).toEqual({ arrowHandled: false, letterHandled: true, chosen: ["a|fix|failed"] });
  });
});
