// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import GraphNode from "./GraphNode";

describe("GraphNode", () => {
  it("draws a neutral out-port when toneByEdge has no entry for its edge", () => {
    const node = { id: "a", x: 100, y: 30, width: 140, height: 60, ports: [{ edge: "a|b|success", side: "out" as const, x: 170, y: 30 }] };
    const model = { id: "a", type: "agent" as const, outcomes: ["success"], isEntry: true, isExit: false, isFail: false, hasProblem: false };

    const { container } = render(
      <svg>
        <GraphNode node={node} model={model} height={60} isTerminal={false} toneByEdge={new Map()} />
      </svg>,
    );

    expect(
      [...container.querySelectorAll("[data-port]")].map((port) => ({ port: port.getAttribute("data-port"), tone: port.getAttribute("data-tone") })),
    ).toEqual([{ port: "a|b|success:out", tone: "neutral" }]);
  });
});
