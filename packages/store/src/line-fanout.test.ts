import { describe, expect, it } from "vitest";
import { FAN_STATIONS, fanLine } from "./fanout.fixtures.js";
import { validateLine } from "./line-validation.js";
import type { StationBody } from "./types.js";

const bodies = new Map<string, StationBody>(Object.entries(FAN_STATIONS));
const known = { stations: new Set(bodies.keys()), bodies };

describe("validateLine on a fan-out", () => {
  it("accepts a source that lists items, a body that runs per item, and a join that collects", () => {
    expect(validateLine(fanLine(), known)).toEqual([]);
  });

  it("names a fan-out whose body is not a node", () => {
    const line = fanLine();

    line.nodes[0] = {
      id: "split",
      station: "splitter",
      fanout: { over: "items", to: "nowhere" },
    };

    expect(validateLine(line, known)).toContain(
      'node "split" fans out to "nowhere", which is not a node',
    );
  });

  it("names a fan-out over an item its station does not produce as a value", () => {
    const line = fanLine();

    line.nodes[0] = {
      id: "split",
      station: "splitter",
      fanout: { over: "rows", to: "work" },
    };

    expect(validateLine(line, known)).toContain(
      'node "split" fans out over "rows", which its station does not produce as a value',
    );
  });

  it("names a fan-out with no success edge into its body", () => {
    const line = fanLine({
      edges: fanLine().edges.filter((edge) => edge.from !== "split"),
    });

    expect(validateLine(line, known)).toContain(
      'node "split" fans out to "work" but has no success edge to it',
    );
  });

  it("names a body with no edge for a failed branch", () => {
    const line = fanLine({
      edges: fanLine().edges.filter((edge) => edge.on !== "failed"),
    });

    expect(validateLine(line, known)).toContain(
      'node "work" is the body of a fan-out and needs an edge for failed',
    );
  });

  it("names a body two sources fan out to", () => {
    const line = fanLine();

    line.nodes.push({
      id: "other",
      station: "splitter",
      fanout: { over: "items", to: "work" },
    });
    line.edges.push(
      { from: "other", to: "work", on: "success" },
      { from: "merge", to: "other", on: "again", iterationMax: 1 },
    );

    expect(validateLine(line, known)).toContain(
      'node "work" is the body of more than one fan-out',
    );
  });

  it("names a body that is itself a fan-out source", () => {
    const line = fanLine();

    line.nodes[1] = {
      id: "work",
      station: "splitter",
      fanout: { over: "items", to: "merge" },
    };

    expect(validateLine(line, known)).toContain(
      'node "work" is the body of a fan-out and cannot fan out itself',
    );
  });

  it("names a collected item no fan-out body produces", () => {
    const line = fanLine();
    const merger = bodies.get("merger")!;

    expect(
      validateLine(line, {
        ...known,
        bodies: new Map(bodies).set("merger", {
          ...merger,
          needs: [{ name: "results", kind: "value", collect: "nothing" }],
        }),
      }),
    ).toContain(
      'node "merge" collects "nothing", which no fan-out body produces as a value',
    );
  });

  it("names a collected item that the bodies of two fan-outs both produce", () => {
    const line = fanLine();

    line.nodes.push(
      { id: "split-more", station: "splitter", fanout: { over: "items", to: "work-more" } },
      { id: "work-more", station: "worker" },
    );
    line.edges.push(
      { from: "merge", to: "split-more", on: "again", iterationMax: 1 },
      { from: "split-more", to: "work-more", on: "success" },
      { from: "work-more", to: "merge", on: "success" },
      { from: "work-more", to: "failed", on: "failed" },
    );

    expect(validateLine(line, known)).toContain(
      'node "merge" collects "result", which more than one fan-out body produces',
    );
  });
});
