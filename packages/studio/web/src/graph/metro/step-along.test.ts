import { describe, expect, it } from "vitest";
import type { AssemblyLineDefinition } from "../assembly-line-definition";
import { codeReviewDefinition, implementationDefinition } from "../definition.fixtures";
import { stepAlong } from "./step-along";

describe("stepAlong", () => {
  it("moves right from review to done along its first edge", () => {
    const cursor = stepAlong(codeReviewDefinition, { nodeId: "review", lineIndex: 0 }, "right");

    expect(cursor).toEqual({ nodeId: "done", lineIndex: 0 });
  });

  it("stays on done when moving right from a node with no outgoing edges", () => {
    const cursor = stepAlong(codeReviewDefinition, { nodeId: "done", lineIndex: 0 }, "right");

    expect(cursor).toEqual({ nodeId: "done", lineIndex: 0 });
  });

  it("moves down from review line 0 to line 1 on the same node", () => {
    const cursor = stepAlong(codeReviewDefinition, { nodeId: "review", lineIndex: 0 }, "down");

    expect(cursor).toEqual({ nodeId: "review", lineIndex: 1 });
  });

  it("stays on done line 0 when moving down from a node with no outgoing edges", () => {
    const cursor = stepAlong(codeReviewDefinition, { nodeId: "done", lineIndex: 0 }, "down");

    expect(cursor).toEqual({ nodeId: "done", lineIndex: 0 });
  });

  it("wraps down from review's last line 2 to line 0", () => {
    const cursor = stepAlong(codeReviewDefinition, { nodeId: "review", lineIndex: 2 }, "down");

    expect(cursor).toEqual({ nodeId: "review", lineIndex: 0 });
  });

  it("wraps up from review line 0 to its last line 2", () => {
    const cursor = stepAlong(codeReviewDefinition, { nodeId: "review", lineIndex: 0 }, "up");

    expect(cursor).toEqual({ nodeId: "review", lineIndex: 2 });
  });

  it("stays on done line 0 when moving up from a node with no outgoing edges", () => {
    const cursor = stepAlong(codeReviewDefinition, { nodeId: "done", lineIndex: 0 }, "up");

    expect(cursor).toEqual({ nodeId: "done", lineIndex: 0 });
  });

  it("moves up from review line 2 to line 1 on the same node", () => {
    const cursor = stepAlong(codeReviewDefinition, { nodeId: "review", lineIndex: 2 }, "up");

    expect(cursor).toEqual({ nodeId: "review", lineIndex: 1 });
  });

  it("wraps down from review's out-of-range line -5 to line 2", () => {
    const cursor = stepAlong(codeReviewDefinition, { nodeId: "review", lineIndex: -5 }, "down");

    expect(cursor).toEqual({ nodeId: "review", lineIndex: 2 });
  });

  it("moves left from address back to review on its changes_requested line 1", () => {
    const cursor = stepAlong(implementationDefinition, { nodeId: "address", lineIndex: 0 }, "left");

    expect(cursor).toEqual({ nodeId: "review", lineIndex: 1 });
  });

  it("stays on triage line 0 when moving right along an edge to undeclared escalation", () => {
    const definition: AssemblyLineDefinition = {
      name: "triage-line",
      description: "",
      version: 1,
      entry: "triage",
      exit: "done",
      nodes: [
        { id: "triage", type: "marker" },
        { id: "done", type: "marker" },
      ],
      edges: [
        { from: "triage", to: "escalation", on: "escalated" },
        { from: "triage", to: "done", on: "success" },
      ],
    };

    const cursor = stepAlong(definition, { nodeId: "triage", lineIndex: 0 }, "right");

    expect(cursor).toEqual({ nodeId: "triage", lineIndex: 0 });
  });

  it("stays on done line 0 when moving left along a first incoming edge from undeclared ghost", () => {
    const definition: AssemblyLineDefinition = {
      name: "ghost-line",
      description: "",
      version: 1,
      entry: "a",
      exit: "done",
      nodes: [
        { id: "a", type: "marker" },
        { id: "done", type: "marker" },
      ],
      edges: [
        { from: "ghost", to: "done", on: "success" },
        { from: "a", to: "done", on: "success" },
      ],
    };

    const cursor = stepAlong(definition, { nodeId: "done", lineIndex: 0 }, "left");

    expect(cursor).toEqual({ nodeId: "done", lineIndex: 0 });
  });

  it("stays on review line 1 when moving left from the entry with no incoming edges", () => {
    const cursor = stepAlong(codeReviewDefinition, { nodeId: "review", lineIndex: 1 }, "left");

    expect(cursor).toEqual({ nodeId: "review", lineIndex: 1 });
  });

  it("stays on review line -1 when moving right with a negative line index", () => {
    const cursor = stepAlong(codeReviewDefinition, { nodeId: "review", lineIndex: -1 }, "right");

    expect(cursor).toEqual({ nodeId: "review", lineIndex: -1 });
  });
});
