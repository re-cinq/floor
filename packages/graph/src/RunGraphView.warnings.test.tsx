// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import RunGraphView from "./RunGraphView";
import { markerLine } from "./metro/line.fixtures";
import { nodeEl, renderGraph } from "./run-graph.test-helpers";

describe("RunGraphView warnings", () => {
  it("draws one triage|escalation|escalated stub reading ⚠ nobody starts on it when escalation is undeclared", async () => {
    const definition = markerLine({
      kind: "agent",
      entry: "triage",
      nodeIds: ["triage", "done"],
      edges: [
        ["triage", "done", "success"],
        ["triage", "escalation", "escalated"],
      ],
    });

    const { container } = await renderGraph(<RunGraphView definition={definition} />);
    const stubs = [...container.querySelectorAll("[data-stub]")].map((stub) => ({ key: stub.getAttribute("data-stub"), text: stub.textContent }));

    expect(stubs).toEqual([{ key: "triage|escalation|escalated", text: "⚠ nobody starts on it" }]);
  });

  it("marks the unreachable archive card and its Archive|unreachable texts, leaving the reached a card as A|agent", async () => {
    const definition = markerLine({ kind: "agent", entry: "a", nodeIds: ["a", "archive", "done"], edges: [["a", "done", "success"]] });

    const { container } = await renderGraph(<RunGraphView definition={definition} />);
    const cardOf = (id: string) => ({
      flag: nodeEl(container, id).getAttribute("data-unreachable"),
      texts: [...nodeEl(container, id).querySelectorAll("text:not([data-badge] text)")].map((text) => text.textContent),
    });

    expect({ archive: cardOf("archive"), a: cardOf("a") }).toEqual({
      archive: { flag: "true", texts: ["Archive", "unreachable"] },
      a: { flag: null, texts: ["A", "agent"] },
    });
  });
});
