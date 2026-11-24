import type { LineBody } from "@re-cinq/floor-contracts";
import { describe, expect, it } from "vitest";
import { edgeTaken } from "./run-edge.js";

const line: LineBody = {
  entry: "work",
  exit: "done",
  fail: "fail",
  args: {},
  nodes: [{ id: "work", station: "worker" }, { id: "done" }, { id: "fail" }],
  edges: [
    { from: "work", to: "done", on: "success" },
    { from: "work", to: "fail", on: "failed" },
  ],
};

describe("edgeTaken", () => {
  it("returns the work to fail edge for outcome failed from work", () => {
    expect(edgeTaken({ line, node: "work", outcome: "failed" })).toMatchObject({ from: "work", to: "fail", on: "failed" });
  });
});
