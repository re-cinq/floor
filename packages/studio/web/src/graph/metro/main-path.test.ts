import { describe, expect, it } from "vitest";
import { codeReviewDefinition, implementationDefinition } from "../definition.fixtures";
import { markerLine } from "./line.fixtures";
import { mainPathOf } from "./main-path";

describe("mainPathOf", () => {
  it("returns review, done and the review to done success edge when the entry succeeds straight to the exit", () => {
    expect(mainPathOf(codeReviewDefinition)).toEqual({
      nodes: new Set(["review", "done"]),
      edges: new Set(["review|done|success"]),
    });
  });

  it("runs implement to done through the always edges when push and retrospective only continue on always", () => {
    expect(mainPathOf(implementationDefinition)).toEqual({
      nodes: new Set(["implement", "validate", "push", "review", "retrospective", "done"]),
      edges: new Set([
        "implement|validate|success",
        "validate|push|success",
        "push|review|always",
        "review|retrospective|success",
        "retrospective|done|always",
      ]),
    });
  });

  it("stops at the repeat and leaves out the back edge when b succeeds back to a", () => {
    const loopingDefinition = markerLine({
      entry: "a",
      nodeIds: ["a", "b", "done"],
      edges: [
        ["a", "b", "success"],
        ["b", "a", "success"],
        ["b", "done", "failure"],
      ],
    });

    expect(mainPathOf(loopingDefinition)).toEqual({
      nodes: new Set(["a", "b"]),
      edges: new Set(["a|b|success"]),
    });
  });

  it("follows the success edge to done when a also has an always edge listed before it", () => {
    const branchingDefinition = markerLine({
      entry: "a",
      nodeIds: ["a", "b", "done"],
      edges: [
        ["a", "b", "always"],
        ["a", "done", "success"],
        ["b", "done", "success"],
      ],
    });

    expect(mainPathOf(branchingDefinition)).toEqual({
      nodes: new Set(["a", "done"]),
      edges: new Set(["a|done|success"]),
    });
  });

  it("ends at done and leaves out after when done has a success edge of its own", () => {
    const exitWithSuccessorDefinition = markerLine({
      entry: "a",
      nodeIds: ["a", "done", "after"],
      edges: [
        ["a", "done", "success"],
        ["done", "after", "success"],
      ],
    });

    expect(mainPathOf(exitWithSuccessorDefinition)).toEqual({
      nodes: new Set(["a", "done"]),
      edges: new Set(["a|done|success"]),
    });
  });

  it("returns no stations and no edges when the entry ghost is not declared among the nodes", () => {
    const ghostEntryDefinition = markerLine({
      entry: "ghost",
      nodeIds: ["a", "done"],
      edges: [
        ["ghost", "a", "success"],
      ],
    });

    expect(mainPathOf(ghostEntryDefinition)).toEqual({
      nodes: new Set(),
      edges: new Set(),
    });
  });

  it("stops at a and leaves out the ghost edge when a succeeds into the undeclared ghost", () => {
    const ghostTargetDefinition = markerLine({
      entry: "a",
      nodeIds: ["a", "done"],
      edges: [
        ["a", "ghost", "success"],
        ["ghost", "done", "success"],
      ],
    });

    expect(mainPathOf(ghostTargetDefinition)).toEqual({
      nodes: new Set(["a"]),
      edges: new Set(),
    });
  });
});
