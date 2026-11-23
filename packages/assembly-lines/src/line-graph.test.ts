import { describe, expect, it } from "vitest";
import { downstreamOf } from "./line-graph.js";

describe("downstreamOf", () => {
  it.each([
    { name: "returns plan and review after write when the line runs write, plan, review", start: "write", edges: [{ from: "write", to: "plan" }, { from: "plan", to: "review" }], expected: ["plan", "review"] },
    { name: "returns nothing after review when review is the last node", start: "review", edges: [{ from: "write", to: "review" }], expected: [] },
    { name: "returns plan and write after write when plan loops back to write", start: "write", edges: [{ from: "write", to: "plan" }, { from: "plan", to: "write" }], expected: ["plan", "write"] },
  ])("$name", ({ start, edges, expected }) => {
    expect([...downstreamOf(start, edges)].sort()).toEqual(expected);
  });
});
