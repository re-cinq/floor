// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RunGraphView from "./RunGraphView";
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import { markerLine } from "./metro/line.fixtures";
import { nodeTitle } from "./node-tooltip";
import { cardWidthOf } from "./run-graph-geometry";
import { edgeEl, labelOf, nodeEl, renderGraph } from "./run-graph.test-helpers";
import { codeReviewDefinition, featurePlanningDefinition, implementationDefinition } from "./definition.fixtures";

function Selectable({ definition }: { definition: AssemblyLineDefinition }) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <>
      <RunGraphView definition={definition} selectedNodeId={selected} onSelectNode={setSelected} />
      <output aria-label="selected">{selected}</output>
    </>
  );
}

const roundedToHundredths = (text: string) => text.replace(/-?\d+(\.\d+)?(e-?\d+)?/g, (number) => String(Math.round(Number(number) * 100) / 100));

function roundedTransformOf(container: HTMLElement) {
  const drawing = container.querySelector("svg[role='img']");
  const transform = drawing?.parentElement?.getAttribute("transform") ?? "";

  return roundedToHundredths(transform);
}

const waitForFittedView = (container: HTMLElement) => waitFor(() => expect(roundedTransformOf(container)).toBe("translate(0 61.61) scale(0.69)"));


describe("RunGraphView", () => {
  it("draws every node and one connector per outcome, even when outcomes lead to the same node", async () => {
    const { container } = await renderGraph(<RunGraphView definition={codeReviewDefinition} />);

    expect([container.querySelectorAll("[data-node]").length, container.querySelectorAll("[data-edge]").length]).toEqual([2, 3]);
  });

  it("draws a card as wide as its full title when the station id is long", async () => {
    const stationId = "reviewTheWholeChangesetCarefully";
    const title = nodeTitle(stationId);
    const definition = markerLine({ entry: stationId, nodeIds: [stationId, "done"], edges: [[stationId, "done", "success"]], kind: "agent" });
    const { container } = await renderGraph(<RunGraphView definition={definition} />);
    const card = nodeEl(container, stationId);

    expect({ width: card.querySelector("rect")?.getAttribute("width"), title: card.querySelector("text")?.textContent }).toEqual({
      width: String(cardWidthOf(title)),
      title,
    });
  });

  it("draws every station card 60 tall, even review with three outcomes", async () => {
    const { container } = await renderGraph(<RunGraphView definition={codeReviewDefinition} />);
    const boxHeights = [...container.querySelectorAll("[data-shape='card']")].map((card) => card.querySelector("rect")?.getAttribute("height"));

    expect(boxHeights).toEqual(["60"]);
  });

  it("draws done, a marker, as a terminal dot with no card rect, and review, an agent, as a card", async () => {
    const { container } = await renderGraph(<RunGraphView definition={codeReviewDefinition} />);
    const shapeOf = (id: string) => ({
      shape: nodeEl(container, id).getAttribute("data-shape"),
      rects: [...nodeEl(container, id).querySelectorAll("rect")].filter((rect) => !rect.closest("[data-badge]")).length,
    });

    expect({ review: shapeOf("review"), done: shapeOf("done") }).toEqual({
      review: { shape: "card", rects: 1 },
      done: { shape: "terminal", rects: 0 },
    });
  });

  it("captions the done terminal dot with its title and draws its ring and core", async () => {
    const { container } = await renderGraph(<RunGraphView definition={codeReviewDefinition} />);
    const terminal = nodeEl(container, "done");
    const texts = [...terminal.querySelectorAll("text")].filter((text) => !text.closest("[data-badge]")).map((text) => text.textContent);

    expect({ texts, circles: terminal.querySelectorAll("circle:not([data-port])").length }).toEqual({ texts: [nodeTitle("done")], circles: 2 });
  });

  it("draws review to done as three connectors keyed, toned and labelled by their outcome", async () => {
    const { container } = await renderGraph(<RunGraphView definition={codeReviewDefinition} />);
    const drawn = [...container.querySelectorAll("[data-edge]")].map((edge) => {
      const key = edge.getAttribute("data-edge") ?? "";

      return { key, tone: edge.getAttribute("data-tone"), label: labelOf(container, key) };
    });

    expect(drawn).toEqual([
      { key: "review|done|success", tone: "ok", label: "success" },
      { key: "review|done|changes_requested", tone: "warn", label: "changes_requested" },
      { key: "review|done|failed", tone: "err", label: "failed" },
    ]);
  });

  it("shows the review card as its title Review over its kind agent, with no outcome list", async () => {
    const { container } = await renderGraph(<RunGraphView definition={codeReviewDefinition} />);
    const cardTexts = [...nodeEl(container, "review").querySelectorAll("text")].filter((text) => !text.closest("[data-badge]")).map((text) => text.textContent);

    expect(cardTexts).toEqual(["Review", "agent"]);
  });

  it("draws a connector from review for each outcome, to different nodes or the same one", async () => {
    const { container } = await renderGraph(<RunGraphView definition={implementationDefinition} />);
    const fromReview = [...container.querySelectorAll("[data-edge]")].map((edge) => edge.getAttribute("data-edge")).filter((key) => key?.startsWith("review|"));

    expect(fromReview).toEqual(["review|retrospective|success", "review|address|changes_requested", "review|retrospective|failed"]);
  });

  it("labels a self loop and a back edge with their outcome and iteration cap, and a lone forward hop with its outcome", async () => {
    const { container } = await renderGraph(<RunGraphView definition={implementationDefinition} />);

    expect([
      labelOf(container, "implement|implement|failed"),
      labelOf(container, "address|validate|always"),
      labelOf(container, "push|review|always"),
    ]).toEqual(["failed (max 1)", "always (max 2)", "always"]);
  });

  it("tones each outcome's own hop, including two outcomes that lead to the same node", async () => {
    const { container } = await renderGraph(<RunGraphView definition={implementationDefinition} />);

    expect(
      ["review|address|changes_requested", "review|retrospective|success", "review|retrospective|failed"].map((key) => edgeEl(container, key).getAttribute("data-tone")),
    ).toEqual(["warn", "ok", "err"]);
  });

  it("names each node with its family, what it wears and its outcomes, so meaning does not rest on color", async () => {
    const { container } = await renderGraph(<RunGraphView definition={codeReviewDefinition} />);

    expect(nodeEl(container, "review").getAttribute("aria-label")).toBe("review, agent, the line starts here, outcomes: success, changes_requested, failed");
  });

  it("describes the whole drawing to a screen reader as one picture with the line's name", async () => {
    render(<RunGraphView definition={codeReviewDefinition} />);

    expect(await screen.findByRole("img", { name: "Assembly line graph: code-review" })).toBeTruthy();
  });

  it("wears a badge for the entry, the exit, a fan-out, an outside start event and a problem", async () => {
    const flagged: AssemblyLineDefinition = {
      ...codeReviewDefinition,
      nodes: [{ id: "review", type: "agent", fanout: { over: "files", to: "done" }, outsideStart: "pr.opened", hasProblem: true }, codeReviewDefinition.nodes[1]],
    };
    const { container } = await renderGraph(<RunGraphView definition={flagged} />);
    const words = (id: string) => [...nodeEl(container, id).querySelectorAll("[data-badge] text")].map((word) => word.textContent);

    expect([words("review"), words("done")]).toEqual([["entry", "fan-out", "event", "problem"], ["exit"]]);
  });

  it("files the review node under agent and the done node under marker, and lists only those families in the legend", async () => {
    const { container } = await renderGraph(<RunGraphView definition={codeReviewDefinition} />);

    expect({
      review: nodeEl(container, "review").getAttribute("data-family"),
      done: nodeEl(container, "done").getAttribute("data-family"),
      legend: within(screen.getByRole("list", { name: "Step types" })).getAllByRole("listitem").map((row) => row.textContent),
    }).toEqual({ review: "agent", done: "marker", legend: ["Agent", "Marker"] });
  });

  it("says so when the line has no nodes", async () => {
    render(<RunGraphView definition={{ ...codeReviewDefinition, nodes: [], edges: [] }} />);

    expect(screen.getByText("This assembly line has no nodes to draw.")).toBeTruthy();
  });

  it("draws the graph at its natural size instead of scaling it to the panel", async () => {
    const { container } = await renderGraph(<RunGraphView definition={codeReviewDefinition} />);
    const svg = container.querySelector("svg[role='img']");

    expect([Number(svg?.getAttribute("width")) > 0, Number(svg?.getAttribute("height")) > 0]).toEqual([true, true]);
  });

  it("draws the node review of code-review inside the Graph viewport", async () => {
    render(<RunGraphView definition={codeReviewDefinition} />);

    expect(within(await screen.findByRole("group", { name: "Graph viewport" })).getByRole("group", { name: /^review,/ })).toBeTruthy();
  });

  it("draws three toned out-ports on review and one grey in-port on done for code review", async () => {
    const { container } = await renderGraph(<RunGraphView definition={codeReviewDefinition} />);
    const portsOf = (id: string) =>
      [...nodeEl(container, id).querySelectorAll("[data-port]")]
        .map((port) => ({ port: port.getAttribute("data-port"), tone: port.getAttribute("data-tone") }))
        .sort((left, right) => String(left.port).localeCompare(String(right.port)));

    expect({ review: portsOf("review"), done: portsOf("done") }).toEqual({
      review: [
        { port: "review|done|changes_requested:out", tone: "warn" },
        { port: "review|done|failed:out", tone: "err" },
        { port: "review|done|success:out", tone: "ok" },
      ],
      done: [{ port: "review|done|success:in", tone: "in" }],
    });
  });
});

describe("RunGraphView selection", () => {
  it("selects a node on click, pressing it and leaving the others unpressed", async () => {
    const { container } = await renderGraph(<Selectable definition={codeReviewDefinition} />);

    await userEvent.click(nodeEl(container, "review"));

    expect([nodeEl(container, "review").getAttribute("aria-pressed"), nodeEl(container, "done").getAttribute("aria-pressed")]).toEqual(["true", "false"]);
  });

  it("selects the focused node on Enter and on Space", async () => {
    const { container } = await renderGraph(<Selectable definition={implementationDefinition} />);

    nodeEl(container, "review").focus();
    await userEvent.keyboard("{Enter}");
    const afterEnter = screen.getByLabelText("selected").textContent;

    nodeEl(container, "push").focus();
    await userEvent.keyboard(" ");

    expect([afterEnter, screen.getByLabelText("selected").textContent]).toEqual(["review", "push"]);
  });

  it("selects nothing on a key other than Enter or Space", async () => {
    const { container } = await renderGraph(<Selectable definition={codeReviewDefinition} />);

    nodeEl(container, "review").focus();
    await userEvent.keyboard("a");

    expect(screen.getByLabelText("selected").textContent).toBe("");
  });

  it("makes every node reachable by Tab", async () => {
    const { container } = await renderGraph(<Selectable definition={codeReviewDefinition} />);

    expect([...container.querySelectorAll("[data-node]")].map((node) => node.getAttribute("tabindex"))).toEqual(["0", "0"]);
  });

  it("emphasizes the selected node's outgoing hops and fades the others", async () => {
    const { container } = await renderGraph(<Selectable definition={implementationDefinition} />);

    await userEvent.click(nodeEl(container, "review"));

    expect({
      leaving: edgeEl(container, "review|address|changes_requested").getAttribute("data-emphasis"),
      elsewhere: edgeEl(container, "push|review|always").getAttribute("data-emphasis"),
    }).toEqual({ leaving: "outgoing", elsewhere: "other" });
  });

  it("leaves every hop plain while nothing is selected", async () => {
    const { container } = await renderGraph(<Selectable definition={implementationDefinition} />);

    expect([...container.querySelectorAll("[data-edge]")].some((edge) => edge.hasAttribute("data-emphasis"))).toBe(false);
  });
});

describe("RunGraphView bringing a selected node into view", () => {
  afterEach(() => vi.restoreAllMocks());

  it("pans to translate(-532.86 -43.7) scale(1.69) when done, below the zoomed view, is selected", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 400, 300));
    const { container, rerender } = await renderGraph(<RunGraphView definition={codeReviewDefinition} />);
    await waitForFittedView(container);
    for (let press = 0; press < 4; press++) fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    rerender(<RunGraphView definition={codeReviewDefinition} selectedNodeId="done" />);

    await waitFor(() => expect(roundedTransformOf(container)).toBe("translate(-532.86 -43.7) scale(1.69)"));
  });
});

describe("RunGraphView station tooltip", () => {
  const described: AssemblyLineDefinition = {
    ...codeReviewDefinition,
    nodes: [{ id: "review", type: "agent", description: "An AI agent reviews the pull request." }, codeReviewDefinition.nodes[1]],
  };

  it("shows what review does after a hover, tied to the node by aria-describedby", async () => {
    const { container } = await renderGraph(<RunGraphView definition={described} />);

    fireEvent.pointerOver(nodeEl(container, "review"));
    const tooltip = await screen.findByRole("tooltip");

    expect({ text: tooltip.textContent, describedBy: nodeEl(container, "review").getAttribute("aria-describedby") }).toEqual({
      text: "ReviewAgentAn AI agent reviews the pull request.",
      describedBy: tooltip.id,
    });
  });

  it("hides the tooltip once the pointer leaves review", async () => {
    const { container } = await renderGraph(<RunGraphView definition={described} />);

    fireEvent.pointerOver(nodeEl(container, "review"));
    await screen.findByRole("tooltip");
    fireEvent.pointerOut(nodeEl(container, "review"));

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows the tooltip at once when review takes keyboard focus, and hides it on Escape", async () => {
    const { container } = await renderGraph(<Selectable definition={described} />);

    act(() => nodeEl(container, "review").focus());
    const shown = screen.queryByRole("tooltip")?.textContent;
    fireEvent.keyDown(nodeEl(container, "review"), { key: "Escape" });

    expect([shown, screen.queryByRole("tooltip")]).toEqual(["ReviewAgentAn AI agent reviews the pull request.", null]);
  });

  it("draws one path and one label per outcome when outcomes lead to the same node", async () => {
    const { container } = await renderGraph(<RunGraphView definition={featurePlanningDefinition} />);
    const keys = ["analyze|author|success", "analyze|author|changes_requested", "analyze|author|failed"];

    expect({
      paths: keys.map((key) => edgeEl(container, key).querySelectorAll("path").length),
      labels: keys.map((key) => container.querySelectorAll(`[data-edge-label="${key}"]`).length),
    }).toEqual({ paths: [1, 1, 1], labels: [1, 1, 1] });
  });

  it("draws the definition's own nodes and no exit dot as a station", async () => {
    const { container } = await renderGraph(<RunGraphView definition={featurePlanningDefinition} />);
    const drawn = [...container.querySelectorAll("[data-node]")].map((node) => node.getAttribute("data-node"));

    const defined = featurePlanningDefinition.nodes.map((node) => node.id);

    expect(drawn.sort()).toEqual(defined.sort());
  });

  it("draws one exit dot for each off-main-path line into done in code review", async () => {
    const { container } = await renderGraph(<RunGraphView definition={codeReviewDefinition} />);
    const dotKeys = [...container.querySelectorAll("[data-exit-dot]")].map((dot) => dot.getAttribute("data-exit-dot"));

    expect(dotKeys.sort()).toEqual(["review|done|changes_requested", "review|done|failed"]);
  });

  it("names the failed exit dot of code review with the title ends the run at done", async () => {
    const { container } = await renderGraph(<RunGraphView definition={codeReviewDefinition} />);

    expect(container.querySelector("[data-exit-dot='review|done|failed'] title")?.textContent).toEqual("ends the run at done");
  });
});
