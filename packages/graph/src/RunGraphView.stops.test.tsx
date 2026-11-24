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

  it("keeps push a card when compactStops is not set", async () => {
    const { container } = await renderGraph(<RunGraphView definition={implementationDefinition} />);

    expect(nodeEl(container, "push").getAttribute("data-shape")).toEqual("card");
  });

  it("keeps the aria-label, ports and selection on a stop", async () => {
    const { container } = await renderGraph(<RunGraphView definition={implementationDefinition} compactStops selectedNodeId="push" />);
    const push = nodeEl(container, "push");

    expect({
      label: Boolean(push.getAttribute("aria-label")),
      selected: push.getAttribute("data-selected"),
      ports: push.querySelectorAll("[data-port]").length > 0,
    }).toEqual({ label: true, selected: "true", ports: true });
  });

  it("draws one family glyph inside the push stop", async () => {
    const { container } = await renderGraph(<RunGraphView definition={implementationDefinition} compactStops />);
    const push = nodeEl(container, "push");

    expect([...push.querySelectorAll("path")].filter((glyph) => !glyph.closest("[data-badge]"))).toHaveLength(1);
  });
});
