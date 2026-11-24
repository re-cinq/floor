// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { fireEvent } from "@testing-library/react";
import RunGraphView from "./RunGraphView";
import { codeReviewDefinition } from "./definition.fixtures";
import { edgeEl, renderGraph } from "./run-graph.test-helpers";

describe("line selection", () => {
  it("reports review|done|failed for its connector and review|done|success for its label", async () => {
    const selectedLines: string[] = [];
    const { container } = await renderGraph(<RunGraphView definition={codeReviewDefinition} onSelectLine={(key) => selectedLines.push(key)} />);

    fireEvent.click(edgeEl(container, "review|done|failed"));
    fireEvent.click(container.querySelector('[data-edge-label="review|done|success"]') as HTMLElement);

    expect(selectedLines).toEqual(["review|done|failed", "review|done|success"]);
  });

  it("marks only the review|done|failed connector and its label when selectedLineKey is review|done|failed", async () => {
    const { container } = await renderGraph(<RunGraphView definition={codeReviewDefinition} selectedLineKey="review|done|failed" />);

    const selected = [...container.querySelectorAll("[data-selected='true']:not([data-node])")].map((element) => ({
      edge: element.getAttribute("data-edge"),
      label: element.getAttribute("data-edge-label"),
    }));

    expect(selected.sort((a, b) => `${a.edge}${a.label}`.localeCompare(`${b.edge}${b.label}`))).toEqual([
      { edge: null, label: "review|done|failed" },
      { edge: "review|done|failed", label: null },
    ]);
  });
});
