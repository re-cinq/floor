// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import RunGraphView from "./RunGraphView";
import { implementationDefinition } from "./definition.fixtures";
import { nodeTitle } from "./node-tooltip";
import { nodeEl, renderGraph } from "./run-graph.test-helpers";

describe("RunGraphView with compactStops", () => {
  it("draws push as a stop with one r=12 circle and its title, and review stays a card", async () => {
    const { container } = await renderGraph(<RunGraphView definition={implementationDefinition} compactStops />);
    const push = nodeEl(container, "push");
    const review = nodeEl(container, "review");

    expect({
      push: {
        shape: push.getAttribute("data-shape"),
        radii: [...push.querySelectorAll("circle:not([data-port])")].map((circle) => circle.getAttribute("r")),
        texts: [...push.querySelectorAll("text")].filter((text) => !text.closest("[data-badge]")).map((text) => text.textContent),
      },
      review: { shape: review.getAttribute("data-shape") },
    }).toEqual({
      push: { shape: "stop", radii: ["12"], texts: [nodeTitle("push")] },
      review: { shape: "card" },
    });
  });
});
