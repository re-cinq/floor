// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RunGraphView from "./RunGraphView";
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import { codeReviewDefinition, implementationDefinition } from "./definition.fixtures";

function Selectable({ definition }: { definition: AssemblyLineDefinition }) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <>
      <RunGraphView definition={definition} selectedNodeId={selected} onSelectNode={setSelected} />
      <output aria-label="selected">{selected}</output>
    </>
  );
}

const nodeEl = (container: HTMLElement, id: string) => container.querySelector(`[data-node="${id}"]`) as HTMLElement;
const edgeEl = (container: HTMLElement, key: string) => container.querySelector(`[data-edge="${key}"]`) as HTMLElement;
const labelOf = (container: HTMLElement, key: string) => container.querySelector(`[data-edge-label="${key}"]`)?.textContent ?? "";

describe("RunGraphView", () => {
  it("draws every node and one connector for outcomes that lead to the same node", () => {
    const { container } = render(<RunGraphView definition={codeReviewDefinition} />);

    expect([container.querySelectorAll("[data-node]").length, container.querySelectorAll("[data-edge]").length]).toEqual([2, 1]);
  });

  it("lists the outcomes inside the node they leave, under their own names", () => {
    const { container } = render(<RunGraphView definition={codeReviewDefinition} />);

    expect(within(nodeEl(container, "review")).getAllByText(/^(success|changes_requested|failed)$/).map((row) => row.textContent)).toEqual([
      "success",
      "changes_requested",
      "failed",
    ]);
  });

  it("draws separate branches when outcomes lead to different nodes", () => {
    const { container } = render(<RunGraphView definition={implementationDefinition} />);
    const fromReview = [...container.querySelectorAll("[data-edge]")].map((edge) => edge.getAttribute("data-edge")).filter((key) => key?.startsWith("review->"));

    expect(fromReview).toEqual(["review->retrospective", "review->address"]);
  });

  it("labels a self loop and a back edge with their outcome and iteration cap, and a lone forward hop with nothing", () => {
    const { container } = render(<RunGraphView definition={implementationDefinition} />);

    expect([
      labelOf(container, "implement->implement"),
      labelOf(container, "address->validate"),
      labelOf(container, "push->review"),
    ]).toEqual(["failed (max 1)", "always (max 2)", ""]);
  });

  it("tones the hop of a single outcome that branches off, and leaves a collapsed hop neutral", () => {
    const { container } = render(<RunGraphView definition={implementationDefinition} />);

    expect([edgeEl(container, "review->address").getAttribute("data-tone"), edgeEl(container, "review->retrospective").getAttribute("data-tone")]).toEqual(["warn", "neutral"]);
  });

  it("names each node with its family, what it wears and its outcomes, so meaning does not rest on color", () => {
    const { container } = render(<RunGraphView definition={codeReviewDefinition} />);

    expect(nodeEl(container, "review").getAttribute("aria-label")).toBe("review, agent, the line starts here, outcomes: success, changes_requested, failed");
  });

  it("describes the whole drawing to a screen reader as one picture with the line's name", () => {
    render(<RunGraphView definition={codeReviewDefinition} />);

    expect(screen.getByRole("img", { name: "Assembly line graph: code-review" })).toBeTruthy();
  });

  it("wears a badge for the entry, the exit, a fan-out, an outside start event and a problem", () => {
    const flagged: AssemblyLineDefinition = {
      ...codeReviewDefinition,
      nodes: [{ id: "review", type: "agent", fanout: { over: "files", to: "done" }, outsideStart: "pr.opened", hasProblem: true }, codeReviewDefinition.nodes[1]],
    };
    const { container } = render(<RunGraphView definition={flagged} />);
    const words = (id: string) => [...nodeEl(container, id).querySelectorAll("[data-badge] text")].map((word) => word.textContent);

    expect([words("review"), words("done")]).toEqual([["entry", "fan-out", "event", "problem"], ["exit"]]);
  });

  it("files the review node under agent and the done node under marker, and lists only those families in the legend", () => {
    const { container } = render(<RunGraphView definition={codeReviewDefinition} />);

    expect({
      review: nodeEl(container, "review").getAttribute("data-family"),
      done: nodeEl(container, "done").getAttribute("data-family"),
      legend: within(screen.getByRole("list", { name: "Step types" })).getAllByRole("listitem").map((row) => row.textContent),
    }).toEqual({ review: "agent", done: "marker", legend: ["Agent", "Marker"] });
  });

  it("says so when the line has no nodes", () => {
    render(<RunGraphView definition={{ ...codeReviewDefinition, nodes: [], edges: [] }} />);

    expect(screen.getByText("This assembly line has no nodes to draw.")).toBeTruthy();
  });

  it("draws the graph at its natural size instead of scaling it to the panel", () => {
    const { container } = render(<RunGraphView definition={codeReviewDefinition} />);
    const svg = container.querySelector("svg[role='img']");

    expect([Number(svg?.getAttribute("width")) > 0, Number(svg?.getAttribute("height")) > 0]).toEqual([true, true]);
  });

  it("draws the node review of code-review inside the Graph viewport", () => {
    render(<RunGraphView definition={codeReviewDefinition} />);

    expect(within(screen.getByRole("group", { name: "Graph viewport" })).getByRole("group", { name: /^review,/ })).toBeTruthy();
  });
});

describe("RunGraphView wrapping to the box", () => {
  afterEach(() => vi.restoreAllMocks());

  it("draws code-review on one row, 512 by 200, in a 560 by 200 box too narrow for the width rule", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 560, height: 200 } as DOMRect);
    const { container } = render(<RunGraphView definition={codeReviewDefinition} />);
    const svg = container.querySelector("svg[role='img']");

    expect([svg?.getAttribute("width"), svg?.getAttribute("height")]).toEqual(["512", "200"]);
  });
});

describe("RunGraphView selection", () => {
  it("selects a node on click, pressing it and leaving the others unpressed", async () => {
    const { container } = render(<Selectable definition={codeReviewDefinition} />);

    await userEvent.click(nodeEl(container, "review"));

    expect([nodeEl(container, "review").getAttribute("aria-pressed"), nodeEl(container, "done").getAttribute("aria-pressed")]).toEqual(["true", "false"]);
  });

  it("selects the focused node on Enter and on Space", async () => {
    const { container } = render(<Selectable definition={implementationDefinition} />);

    nodeEl(container, "review").focus();
    await userEvent.keyboard("{Enter}");
    const afterEnter = screen.getByLabelText("selected").textContent;

    nodeEl(container, "push").focus();
    await userEvent.keyboard(" ");

    expect([afterEnter, screen.getByLabelText("selected").textContent]).toEqual(["review", "push"]);
  });

  it("selects nothing on a key other than Enter or Space", async () => {
    const { container } = render(<Selectable definition={codeReviewDefinition} />);

    nodeEl(container, "review").focus();
    await userEvent.keyboard("a");

    expect(screen.getByLabelText("selected").textContent).toBe("");
  });

  it("makes every node reachable by Tab", () => {
    const { container } = render(<Selectable definition={codeReviewDefinition} />);

    expect([...container.querySelectorAll("[data-node]")].map((node) => node.getAttribute("tabindex"))).toEqual(["0", "0"]);
  });

  it("emphasizes the selected node's outgoing hops and fades the others", async () => {
    const { container } = render(<Selectable definition={implementationDefinition} />);

    await userEvent.click(nodeEl(container, "review"));

    expect({
      leaving: edgeEl(container, "review->address").getAttribute("data-emphasis"),
      elsewhere: edgeEl(container, "push->review").getAttribute("data-emphasis"),
    }).toEqual({ leaving: "outgoing", elsewhere: "other" });
  });

  it("leaves every hop plain while nothing is selected", () => {
    const { container } = render(<Selectable definition={implementationDefinition} />);

    expect([...container.querySelectorAll("[data-edge]")].some((edge) => edge.hasAttribute("data-emphasis"))).toBe(false);
  });
});

describe("RunGraphView bringing a selected node into view", () => {
  afterEach(() => vi.restoreAllMocks());

  it("pans to translate(-52.69339005235602 -402.73650196335086) when done, below the zoomed view, is selected", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 400, 300));
    const { container, rerender } = render(<RunGraphView definition={codeReviewDefinition} />);
    for (let press = 0; press < 4; press++) fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    rerender(<RunGraphView definition={codeReviewDefinition} selectedNodeId="done" />);
    const drawing = container.querySelector("svg[role='img']")?.parentElement;

    expect(drawing?.getAttribute("transform")).toBe("translate(-52.69339005235602 -402.73650196335086) scale(1.9173347513089007)");
  });
});

describe("RunGraphView station tooltip", () => {
  const described: AssemblyLineDefinition = {
    ...codeReviewDefinition,
    nodes: [{ id: "review", type: "agent", description: "An AI agent reviews the pull request." }, codeReviewDefinition.nodes[1]],
  };

  it("shows what review does after a hover, tied to the node by aria-describedby", async () => {
    const { container } = render(<RunGraphView definition={described} />);

    fireEvent.pointerOver(nodeEl(container, "review"));
    const tooltip = await screen.findByRole("tooltip");

    expect({ text: tooltip.textContent, describedBy: nodeEl(container, "review").getAttribute("aria-describedby") }).toEqual({
      text: "ReviewAgentAn AI agent reviews the pull request.",
      describedBy: tooltip.id,
    });
  });

  it("hides the tooltip once the pointer leaves review", async () => {
    const { container } = render(<RunGraphView definition={described} />);

    fireEvent.pointerOver(nodeEl(container, "review"));
    await screen.findByRole("tooltip");
    fireEvent.pointerOut(nodeEl(container, "review"));

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows the tooltip at once when review takes keyboard focus, and hides it on Escape", () => {
    const { container } = render(<Selectable definition={described} />);

    act(() => nodeEl(container, "review").focus());
    const shown = screen.queryByRole("tooltip")?.textContent;
    fireEvent.keyDown(nodeEl(container, "review"), { key: "Escape" });

    expect([shown, screen.queryByRole("tooltip")]).toEqual(["ReviewAgentAn AI agent reviews the pull request.", null]);
  });
});
