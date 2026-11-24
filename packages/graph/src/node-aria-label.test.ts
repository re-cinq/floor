import { describe, it, expect } from "vitest";
import { nodeAriaLabel } from "./node-aria-label";
import type { VisibleNode } from "./graph-view-model";

const plainNode: VisibleNode = { id: "work", type: "agent", outcomes: [], isEntry: false, isExit: false, isFail: false, hasProblem: false };

describe("nodeAriaLabel", () => {
  it("reads the id, the family, what it wears and its outcomes", () => {
    expect(nodeAriaLabel({ node: { ...plainNode, isEntry: true, outcomes: ["success", "failed"] }, isTerminal: false })).toBe(
      "work, agent, the line starts here, outcomes: success, failed",
    );
  });

  it("says terminal for a node nothing leaves", () => {
    expect(nodeAriaLabel({ node: { ...plainNode, type: "marker", isExit: true }, isTerminal: true })).toBe("work, marker, the line ends here, terminal");
  });

  it("ends with unreachable for an agent node no start leads to", () => {
    expect(nodeAriaLabel({ node: plainNode, isTerminal: false, isUnreachable: true })).toEqual("work, agent, unreachable");
  });

  it("puts unreachable after terminal for a node nothing leaves and no start leads to", () => {
    expect(nodeAriaLabel({ node: plainNode, isTerminal: true, isUnreachable: true })).toEqual("work, agent, terminal, unreachable");
  });

  it("names a human node human, whatever the family is drawn as", () => {
    expect(nodeAriaLabel({ node: { ...plainNode, type: "human" }, isTerminal: false })).toBe("work, human");
  });
});
