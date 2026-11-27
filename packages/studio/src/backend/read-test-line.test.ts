import { rmSync } from "node:fs";
import { Refusal } from "@re-cinq/floor-assembly-lines";
import { afterEach, describe, expect, it } from "vitest";
import { standInActionsOf } from "../test-run/stand-in-actions.js";
import { startBlockers } from "../test-run/start-blockers.js";
import { readTestLine } from "./read-test-line.js";
import { collectionOnDisk } from "./studio.fixtures.js";
import { REVIEW_LOOP_COLLECTION } from "./test-run.fixtures.js";

describe("readTestLine", () => {
  const dirs: string[] = [];

  function reviewLoopDir(): string {
    const dir = collectionOnDisk(REVIEW_LOOP_COLLECTION);
    dirs.push(dir);

    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("refuses line ghost, which the collection does not have", async () => {
    await expect(readTestLine(reviewLoopDir(), "ghost")).rejects.toThrow(new Refusal("the collection has no line ghost"));
  });

  it("reads review-loop with write bound to review_feedback, an agent and a human station, no blockers, and review's two actions", async () => {
    const line = await readTestLine(reviewLoopDir(), "review-loop");
    const { nodes } = line.body;
    const writeNode = nodes.find((node) => node.id === "write");

    expect({
      id: line.id,
      nodes: nodes.map((node) => node.id),
      writeBind: writeNode?.bind,
      stations: [...line.stations].map(([name, station]) => [name, station.kind]),
      blockers: startBlockers(line),
      reviewActions: standInActionsOf(line, "review"),
    }).toEqual({
      id: "review-loop",
      nodes: ["write", "review", "done", "abandoned"],
      writeBind: { feedback: "review_feedback" },
      stations: [
        ["draft-writer", "agent"],
        ["reviewer", "human"],
      ],
      blockers: [],
      reviewActions: [
        { kind: "report", outcome: "approved", fields: [], others: [{ name: "review_feedback", kind: "value", required: false }] },
        { kind: "report", outcome: "changes_requested", fields: [{ name: "review_feedback", kind: "value", required: true }], others: [] },
      ],
    });
  });
});
