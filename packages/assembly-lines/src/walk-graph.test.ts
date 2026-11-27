import type { LineBody } from "@re-cinq/floor-contracts";
import { describe, expect, it } from "vitest";
import type { StationKind } from "./transition.js";
import { walkGraphOf } from "./walk-graph.js";

function lineOf(nodes: LineBody["nodes"], fields: Partial<LineBody> = {}): LineBody {
  return { entry: nodes[0]!.id, exit: "done", args: {}, nodes, edges: [], ...fields };
}

describe("walkGraphOf", () => {
  it("gives node write no kind when its station ghost-writer is unknown", () => {
    const line = lineOf([{ id: "write", station: "ghost-writer" }, { id: "done" }], {
      edges: [{ from: "write", to: "done", on: "success" }],
    });

    expect(walkGraphOf("review-loop", line, () => undefined)).toEqual({
      name: "review-loop",
      entry: "write",
      exit: "done",
      fail: undefined,
      edges: [{ from: "write", to: "done", on: "success" }],
      fans: [],
      nodes: [{ id: "write", kind: undefined }, { id: "done" }],
    });
  });

  it("gives write the kind agent and review the kind human by asking for draft-writer and reviewer@abc123 only", () => {
    const line = lineOf([{ id: "write", station: "draft-writer" }, { id: "review", station: "reviewer@abc123" }, { id: "done" }]);
    const kinds: Record<string, StationKind> = { "draft-writer": "agent", "reviewer@abc123": "human" };
    const asked: string[] = [];

    const graph = walkGraphOf("review-loop", line, (stationRef) => {
      asked.push(stationRef);

      return kinds[stationRef];
    });

    expect({ nodes: graph.nodes, asked }).toEqual({
      nodes: [{ id: "write", kind: "agent" }, { id: "review", kind: "human" }, { id: "done" }],
      asked: ["draft-writer", "reviewer@abc123"],
    });
  });

  it("carries fail node declined and one fan from split to check", () => {
    const line = lineOf(
      [
        { id: "split", station: "splitter", fanout: { over: "items", to: "check" } },
        { id: "check", station: "checker" },
        { id: "done" },
        { id: "declined" },
      ],
      { fail: "declined" },
    );

    const graph = walkGraphOf("fan-line", line, () => "agent");

    expect({ fail: graph.fail, fans: graph.fans }).toEqual({ fail: "declined", fans: [{ source: "split", body: "check" }] });
  });
});
