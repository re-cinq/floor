// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import RunGraphView from "./RunGraphView";
import { markerLine } from "./metro/line.fixtures";
import { renderGraph } from "./run-graph.test-helpers";

describe("RunGraphView with mainPathOnly", () => {
  it("marks fix, a|fix|failed and fix|a|always off the path on a main line a to done", async () => {
    const definition = markerLine({
      entry: "a",
      exit: "done",
      nodeIds: ["a", "b", "done", "fix"],
      edges: [
        ["a", "b", "success"],
        ["b", "done", "success"],
        ["a", "fix", "failed"],
        ["fix", "a", "always"],
      ],
    });

    const { container } = await renderGraph(<RunGraphView definition={definition} mainPathOnly />);

    const offPath = [...container.querySelectorAll("[data-off-path]:not([data-edge-label])")].map(
      (element) => element.getAttribute("data-node") ?? element.getAttribute("data-edge"),
    );
    expect(offPath.sort()).toEqual(["a|fix|failed", "fix", "fix|a|always"]);
  });

  it("marks only the a|fix|failed and fix|a|always labels off the path on a main line a to done", async () => {
    const definition = markerLine({
      entry: "a",
      exit: "done",
      nodeIds: ["a", "b", "done", "fix"],
      edges: [
        ["a", "b", "success"],
        ["b", "done", "success"],
        ["a", "fix", "failed"],
        ["fix", "a", "always"],
      ],
    });

    const { container } = await renderGraph(<RunGraphView definition={definition} mainPathOnly />);

    const offPathLabels = [...container.querySelectorAll("[data-edge-label][data-off-path]")].map((label) =>
      label.getAttribute("data-edge-label"),
    );
    expect(offPathLabels.sort()).toEqual(["a|fix|failed", "fix|a|always"]);
  });

  it("marks fix, a|fix|failed and fix|a|always off the path after pressing Main path on a main line a to done", async () => {
    const definition = markerLine({
      entry: "a",
      exit: "done",
      nodeIds: ["a", "b", "done", "fix"],
      edges: [
        ["a", "b", "success"],
        ["b", "done", "success"],
        ["a", "fix", "failed"],
        ["fix", "a", "always"],
      ],
    });

    const { container } = await renderGraph(<RunGraphView definition={definition} />);
    fireEvent.click(screen.getByRole("button", { name: "Main path" }));

    const offPath = [...container.querySelectorAll("[data-off-path]:not([data-edge-label])")].map(
      (element) => element.getAttribute("data-node") ?? element.getAttribute("data-edge"),
    );
    expect(offPath.sort()).toEqual(["a|fix|failed", "fix", "fix|a|always"]);
  });

  it("marks nothing off the path after pressing Main path twice on a main line a to done", async () => {
    const definition = markerLine({
      entry: "a",
      exit: "done",
      nodeIds: ["a", "b", "done", "fix"],
      edges: [
        ["a", "b", "success"],
        ["b", "done", "success"],
        ["a", "fix", "failed"],
        ["fix", "a", "always"],
      ],
    });

    const { container } = await renderGraph(<RunGraphView definition={definition} />);
    fireEvent.click(screen.getByRole("button", { name: "Main path" }));
    fireEvent.click(screen.getByRole("button", { name: "Main path" }));

    expect([...container.querySelectorAll("[data-off-path]")]).toEqual([]);
  });

  it("starts the Main path button pressed with fix off the path when mainPathOnly is set, and one press unpresses it and clears the path", async () => {
    const definition = markerLine({
      entry: "a",
      exit: "done",
      nodeIds: ["a", "b", "done", "fix"],
      edges: [
        ["a", "b", "success"],
        ["b", "done", "success"],
        ["a", "fix", "failed"],
        ["fix", "a", "always"],
      ],
    });
    const { container } = await renderGraph(<RunGraphView definition={definition} mainPathOnly />);
    const button = within(container).getByRole("button", { name: "Main path" });
    const read = () => ({ pressed: button.getAttribute("aria-pressed"), offPath: container.querySelectorAll("[data-off-path]").length > 0 });
    const before = read();
    fireEvent.click(button);

    expect({ before, after: read() }).toEqual({
      before: { pressed: "true", offPath: true },
      after: { pressed: "false", offPath: false },
    });
  });
});
