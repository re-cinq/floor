import { describe, expect, it } from "vitest";
import { FAN_STATIONS, fanLine } from "@re-cinq/floor-assembly-lines";
import { startBlockers } from "./start-blockers.js";
import type { TestLine } from "./test-line.js";
import { reviewLoopLine } from "./test-run.fixtures.js";

const draftWriterOnlyLine: TestLine = {
  id: reviewLoopLine.id,
  body: reviewLoopLine.body,
  stations: new Map([["draft-writer", reviewLoopLine.stations.get("draft-writer")!]]),
};

const fanTestLine: TestLine = {
  id: "fan-line",
  body: fanLine(),
  stations: new Map(Object.entries(FAN_STATIONS)),
};

const { nodes: reviewLoopNodes } = reviewLoopLine.body;
const pinnedReviewerLine: TestLine = {
  ...reviewLoopLine,
  body: {
    ...reviewLoopLine.body,
    nodes: reviewLoopNodes.map((node) => (node.id === "review" ? { id: "review", station: "reviewer@abc123" } : node)),
  },
};

describe("startBlockers", () => {
  it("blocks review-loop when node review pins reviewer@abc123", () => {
    expect(startBlockers(pinnedReviewerLine)).toEqual([
      "node review pins station reviewer@abc123, and a local test run only has the station its file defines: remove the pin to test it",
    ]);
  });

  it("blocks fan-line with 'node split fans out to work, and a local test run cannot fan out yet'", () => {
    expect(startBlockers(fanTestLine)).toEqual(["node split fans out to work, and a local test run cannot fan out yet"]);
  });

  it("blocks review-loop when its file defines draft-writer only, since node review names reviewer", () => {
    expect(startBlockers(draftWriterOnlyLine)).toEqual(['node "review" names unknown station "reviewer"']);
  });

  it("blocks nothing for review-loop, a valid line whose file defines both its stations", () => {
    expect(startBlockers(reviewLoopLine)).toEqual([]);
  });
});
