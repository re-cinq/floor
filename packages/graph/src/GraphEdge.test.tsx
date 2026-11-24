// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import GraphEdge from "./GraphEdge";

describe("GraphEdge", () => {
  it("anchors the ×2 count at the label box's right edge minus 3, text-anchor end", () => {
    const edge = {
      from: "a",
      to: "fix",
      on: "failed",
      kind: "forward" as const,
      d: "M 0 0 L 100 0",
      mid: { x: 50, y: 10, vertical: false },
      labelBox: { minX: 20, minY: 2, maxX: 80, maxY: 18 },
    };

    const { container } = render(
      <svg>
        <GraphEdge edge={edge} model={undefined} emphasis={undefined} takenCount={2} />
      </svg>,
    );
    const count = container.querySelector("[data-taken-count]");

    expect({ x: count?.getAttribute("x"), anchor: count?.getAttribute("text-anchor") }).toEqual({ x: "77", anchor: "end" });
  });
});
