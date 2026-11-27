import { describe, expect, it } from "vitest";
import { Refusal } from "@re-cinq/floor-assembly-lines";
import { visitKindOf } from "./visit-kind.js";
import type { TestLine } from "./test-line.js";
import { reviewLoopLine } from "./test-run.fixtures.js";

const serviceLine: TestLine = {
  id: "service-line",
  body: {
    entry: "publish",
    exit: "published",
    fail: "published",
    args: {},
    nodes: [{ id: "publish", station: "publisher" }, { id: "published" }],
    edges: [{ from: "publish", to: "published", on: "success" }],
  },
  stations: new Map([["publisher", { kind: "service", outcomes: ["success"], needs: [], produces: [] }]]),
};

describe("visitKindOf", () => {
  it("refuses node ghost, which review-loop does not have", () => {
    expect(() => visitKindOf(reviewLoopLine, "ghost")).toThrow(new Refusal("node ghost is not in the line"));
  });

  it.each([
    { line: reviewLoopLine, nodeId: "write", kind: "agent", because: "its station draft-writer is an agent" },
    { line: reviewLoopLine, nodeId: "review", kind: "stand-in", because: "its station reviewer is human" },
    { line: reviewLoopLine, nodeId: "done", kind: "marker", because: "it names no station" },
    { line: serviceLine, nodeId: "publish", kind: "stand-in", because: "its station publisher is a service" },
  ])("reads node $nodeId as $kind because $because", ({ line, nodeId, kind }) => {
    expect(visitKindOf(line, nodeId)).toBe(kind);
  });
});
