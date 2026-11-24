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
});
