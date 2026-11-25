import type { LineBody } from "@re-cinq/floor-contracts";
import { describe, expect, it } from "vitest";
import type { Pipeline } from "../shape.js";
import { changedLines } from "./changed-lines.js";

const workLine: LineBody = {
  entry: "work",
  exit: "work",
  args: {},
  nodes: [{ id: "work", station: "worker" }],
  edges: [],
};

function pipelineWith(id: string, body: LineBody): Pipeline {
  return {
    line: { id, body: { ...body } },
    files: {},
    stations: [],
    agentDefinitions: [],
    schedules: [],
    archive: { lines: [], stations: [], agentDefinitions: [], schedules: [] },
  };
}

describe("changedLines", () => {
  it("lists a line whose body differs and leaves out one whose body is equal", () => {
    const grownLine: LineBody = {
      ...workLine,
      exit: "done",
      nodes: [...workLine.nodes, { id: "done" }],
    };

    const changes = changedLines(
      [pipelineWith("build", workLine), pipelineWith("deploy", workLine)],
      [pipelineWith("build", grownLine), pipelineWith("deploy", workLine)],
    );

    expect(changes).toEqual([
      { id: "build", base: { ...workLine }, head: { ...grownLine } },
    ]);
  });

  it("lists a line only in head as added, with no base", () => {
    const changes = changedLines([], [pipelineWith("build", workLine)]);

    expect(changes).toEqual([{ id: "build", head: { ...workLine } }]);
  });

  it("lists a line only in base as removed, with no head", () => {
    const changes = changedLines([pipelineWith("build", workLine)], []);

    expect(changes).toEqual([{ id: "build", base: { ...workLine } }]);
  });
});
