// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import { fireEvent, screen } from "@testing-library/react";
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

  it("keeps the problem badge on the push stop", async () => {
    const flagged: AssemblyLineDefinition = {
      ...implementationDefinition,
      nodes: implementationDefinition.nodes.map((node) => (node.id === "push" ? { ...node, hasProblem: true } : node)),
    };
    const { container } = await renderGraph(<RunGraphView definition={flagged} compactStops />);
    const push = nodeEl(container, "push");

    expect({
      shape: push.getAttribute("data-shape"),
      badges: [...push.querySelectorAll("[data-badge] text")].map((word) => word.textContent),
    }).toEqual({ shape: "stop", badges: ["problem"] });
  });

  it("draws push as a stop after pressing Compact stops", async () => {
    const { container } = await renderGraph(<RunGraphView definition={implementationDefinition} />);
    fireEvent.click(screen.getByRole("button", { name: "Compact stops" }));

    expect(nodeEl(container, "push").getAttribute("data-shape")).toEqual("stop");
  });

  it("draws push as a card after pressing Compact stops twice", async () => {
    const { container } = await renderGraph(<RunGraphView definition={implementationDefinition} />);
    fireEvent.click(screen.getByRole("button", { name: "Compact stops" }));
    fireEvent.click(screen.getByRole("button", { name: "Compact stops" }));

    expect(nodeEl(container, "push").getAttribute("data-shape")).toEqual("card");
  });
});
