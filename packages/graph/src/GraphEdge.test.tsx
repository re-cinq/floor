// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import GraphEdge, { EdgeLabel } from "./GraphEdge";
import { countWidthOf } from "./metro/taken-count";

const failedEdge = {
  from: "a",
  to: "fix",
  on: "failed",
  kind: "forward" as const,
  d: "M 0 0 L 100 0",
  mid: { x: 50, y: 10, vertical: false },
  labelBox: { minX: 20, minY: 2, maxX: 80, maxY: 18 },
};

describe("GraphEdge", () => {
  it("anchors the ×2 count at the label box's right edge minus 3, text-anchor end", () => {
    const { container } = render(
      <svg>
        <GraphEdge edge={failedEdge} model={undefined} emphasis={undefined} takenCount={2} />
      </svg>,
    );
    const count = container.querySelector("[data-taken-count]");

    expect({ x: count?.getAttribute("x"), anchor: count?.getAttribute("text-anchor") }).toEqual({ x: "77", anchor: "end" });
  });

  it("shifts the a|fix|failed label left of the box centre by half the ×2 count width", () => {
    const model = { from: "a", to: "fix", on: "failed", tone: "neutral" as const, label: "failed", branching: true };

    const { container } = render(
      <svg>
        <EdgeLabel edge={failedEdge} model={model} emphasis={undefined} takenCount={2} />
      </svg>,
    );

    expect(Number(container.querySelector("[data-edge-label]")?.getAttribute("x"))).toBe(50 - countWidthOf(2) / 2);
  });

  it("rotates the ×2 count by -90 degrees around its anchor on a vertical edge", () => {
    const verticalEdge = { ...failedEdge, mid: { ...failedEdge.mid, vertical: true } };

    const { container } = render(
      <svg>
        <GraphEdge edge={verticalEdge} model={undefined} emphasis={undefined} takenCount={2} />
      </svg>,
    );

    expect(container.querySelector("[data-taken-count]")?.getAttribute("transform")).toBe("rotate(-90 77 10)");
  });
});
