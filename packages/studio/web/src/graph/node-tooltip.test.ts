import { describe, it, expect } from "vitest";
import { nodeTooltipOf } from "./node-tooltip";
import type { AssemblyLineDefinition } from "./assembly-line-definition";

const planning: AssemblyLineDefinition = {
  name: "feature-planning",
  description: "",
  version: 1,
  entry: "analyze",
  exit: "done",
  fail: "failed",
  nodes: [
    {
      id: "analyze",
      type: "agent",
      description: "An AI agent drafts the plan with its people.",
    },
    { id: "plan-pass-end", type: "service" },
    { id: "done", type: "marker" },
    { id: "failed", type: "marker" },
  ],
  edges: [],
};

describe("nodeTooltipOf", () => {
  it("names analyze an Agent and says what its station does", () => {
    expect(nodeTooltipOf("analyze", planning)).toEqual({
      title: "Analyze",
      kind: "Agent",
      family: "agent",
      description: "An AI agent drafts the plan with its people.",
    });
  });

  it("says No description yet for plan-pass-end, whose station has none", () => {
    expect(nodeTooltipOf("plan-pass-end", planning)?.description).toBe(
      "No description yet.",
    );
  });

  it("says The run ends here for the exit marker done", () => {
    expect(nodeTooltipOf("done", planning)).toMatchObject({
      kind: "Marker",
      description: "The line ends here.",
    });
  });

  it("says The run ends here, as failed for the fail marker failed", () => {
    expect(nodeTooltipOf("failed", planning)?.description).toBe(
      "The line ends here, as failed.",
    );
  });

  it("answers null for a node the line does not have", () => {
    expect(nodeTooltipOf("ghost", planning)).toBeNull();
  });
});
