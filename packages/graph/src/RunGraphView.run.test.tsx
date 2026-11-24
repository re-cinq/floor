// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import RunGraphView from "./RunGraphView";
import { markerLine } from "./metro/line.fixtures";
import { renderGraph } from "./run-graph.test-helpers";

function takenByEdge(container: HTMLElement) {
  return [...container.querySelectorAll("[data-edge]")]
    .map((element) => [element.getAttribute("data-edge"), element.getAttribute("data-taken")])
    .sort(([left], [right]) => String(left).localeCompare(String(right)));
}

function marksByStation(container: HTMLElement) {
  return Object.fromEntries(
    [...container.querySelectorAll("[data-node]")].map((element) => [
      element.getAttribute("data-node"),
      [element.getAttribute("data-visited"), element.getAttribute("data-outcome")],
    ]),
  );
}

describe("RunGraphView run overlay", () => {
  it("marks a|done|success taken and the other two lines not taken when a closed a visit ended in success", async () => {
    const definition = markerLine({
      entry: "a",
      nodeIds: ["a", "fix", "done"],
      edges: [
        ["a", "done", "success"],
        ["a", "fix", "failed"],
        ["fix", "a", "always"],
      ],
    });
    const run = { visits: [{ nodeId: "a", iteration: 1, outcome: "success", open: false }] };

    const { container } = await renderGraph(<RunGraphView definition={definition} run={run} />);

    expect(takenByEdge(container)).toEqual([
      ["a|done|success", "true"],
      ["a|fix|failed", "false"],
      ["fix|a|always", "false"],
    ]);
  });

  it("marks a and fix with their last closed outcome success and done unvisited when a failed then succeeded", async () => {
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
        { nodeId: "a", iteration: 1, outcome: "failed", open: false },
        { nodeId: "fix", iteration: 1, outcome: "success", open: false },
        { nodeId: "a", iteration: 2, outcome: "success", open: false },
      ],
    };

    const { container } = await renderGraph(<RunGraphView definition={definition} run={run} />);

    expect(marksByStation(container)).toEqual({
      a: [null, "success"],
      fix: [null, "success"],
      done: ["false", null],
    });
  });

  it("reads agent · 2 visits · open on a's card when a was visited twice and its second visit is open", async () => {
    const definition = markerLine({
      kind: "agent",
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
        { nodeId: "a", iteration: 1, outcome: "failed", open: false },
        { nodeId: "fix", iteration: 1, outcome: "success", open: false },
        { nodeId: "a", iteration: 2, open: true },
      ],
    };

    const { container } = await renderGraph(<RunGraphView definition={definition} run={run} />);
    const cardTexts = [...container.querySelectorAll('[data-node="a"] text:not([data-badge] text)')].map((text) => text.textContent);

    expect(cardTexts).toEqual(["A", "agent · 2 visits · open"]);
  });

  it("marks only the station with an open visit as open", async () => {
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
        { nodeId: "a", iteration: 1, outcome: "failed", open: false },
        { nodeId: "fix", iteration: 1, open: true },
      ],
    };

    const { container } = await renderGraph(<RunGraphView definition={definition} run={run} />);

    expect([...container.querySelectorAll("[data-open]")].map((element) => element.getAttribute("data-node"))).toEqual(["fix"]);
  });
});
