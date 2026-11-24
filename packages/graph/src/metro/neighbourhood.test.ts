import { describe, expect, it } from "vitest";
import { markerLine } from "./line.fixtures";
import { neighbourhoodOf } from "./neighbourhood";

describe("neighbourhoodOf", () => {
  it("returns a, b, c and their two edges for b when a succeeds to b to c beside an unconnected x to y", () => {
    const line = markerLine({
      entry: "a",
      nodeIds: ["a", "b", "c", "x", "y", "done"],
      edges: [
        ["a", "b", "success"],
        ["b", "c", "success"],
        ["x", "y", "success"],
      ],
    });

    expect(neighbourhoodOf(line, "b")).toEqual({
      nodes: new Set(["a", "b", "c"]),
      edges: new Set(["a|b|success", "b|c|success"]),
    });
  });

  it("returns a, b and edge a|b|success for b when a succeeds to b and to sibling s", () => {
    const line = markerLine({
      entry: "a",
      nodeIds: ["a", "b", "s", "done"],
      edges: [
        ["a", "b", "success"],
        ["a", "s", "success"],
      ],
    });

    expect(neighbourhoodOf(line, "b")).toEqual({
      nodes: new Set(["a", "b"]),
      edges: new Set(["a|b|success"]),
    });
  });

  it("returns a, b, c and all three edges for b when c loops back to a on changes_requested", () => {
    const line = markerLine({
      entry: "a",
      nodeIds: ["a", "b", "c", "done"],
      edges: [
        ["a", "b", "success"],
        ["b", "c", "success"],
        ["c", "a", "changes_requested"],
      ],
    });

    expect(neighbourhoodOf(line, "b")).toEqual({
      nodes: new Set(["a", "b", "c"]),
      edges: new Set(["a|b|success", "b|c|success", "c|a|changes_requested"]),
    });
  });

  it("returns the whole upstream and downstream path a, b, c, d for b on a chain a to d", () => {
    const line = markerLine({
      entry: "a",
      nodeIds: ["a", "b", "c", "d", "done"],
      edges: [
        ["a", "b", "success"],
        ["b", "c", "success"],
        ["c", "d", "success"],
      ],
    });

    expect(neighbourhoodOf(line, "b")).toEqual({
      nodes: new Set(["a", "b", "c", "d"]),
      edges: new Set(["a|b|success", "b|c|success", "c|d|success"]),
    });
  });

  it("returns empty sets for the undeclared id ghost", () => {
    const line = markerLine({
      entry: "a",
      nodeIds: ["a", "done"],
      edges: [["a", "done", "success"]],
    });

    expect(neighbourhoodOf(line, "ghost")).toEqual({ nodes: new Set(), edges: new Set() });
  });
});
