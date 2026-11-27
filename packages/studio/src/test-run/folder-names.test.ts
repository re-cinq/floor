import { Refusal } from "@re-cinq/floor-assembly-lines";
import { describe, expect, it } from "vitest";
import { runFolderName, visitFolderName } from "./folder-names.js";

describe("visitFolderName", () => {
  it.each(["../escape", "a/b", "a\\b", "", ".", "..", ".hidden", "with space", "-flag"])(
    "refuses node id %j as a visit folder name",
    (nodeId) => {
      expect(() => visitFolderName(1, nodeId, 1)).toThrow(
        new Refusal(
          `node ${JSON.stringify(nodeId)} cannot name a visit folder: a name may hold letters, digits, ".", "_" and "-", and starts with a letter or digit`,
        ),
      );
    },
  );

  it.each([
    { sequence: 1, nodeId: "write", iteration: 1, name: "001-write-1" },
    { sequence: 2, nodeId: "review", iteration: 1, name: "002-review-1" },
    { sequence: 12, nodeId: "write", iteration: 4, name: "012-write-4" },
    { sequence: 123, nodeId: "draft_v1.2-final", iteration: 2, name: "123-draft_v1.2-final-2" },
    { sequence: 7, nodeId: "2nd-pass", iteration: 1, name: "007-2nd-pass-1" },
  ])(
    "names visit $sequence of node $nodeId, iteration $iteration, $name",
    ({ sequence, nodeId, iteration, name }) => {
      expect(visitFolderName(sequence, nodeId, iteration)).toBe(name);
    },
  );
});

describe("runFolderName", () => {
  it.each(["../escape", "a/b", "", "..", ".hidden", "with space"])(
    "refuses line id %j as a run folder name",
    (lineId) => {
      expect(() => runFolderName(lineId, new Date(Date.UTC(2026, 10, 27, 14, 12, 30)))).toThrow(
        new Refusal(
          `line ${JSON.stringify(lineId)} cannot name a run folder: a name may hold letters, digits, ".", "_" and "-", and starts with a letter or digit`,
        ),
      );
    },
  );

  it.each([
    {
      lineId: "review-loop",
      startedIso: "2026-11-27T14:12:30Z",
      startedAt: new Date(Date.UTC(2026, 10, 27, 14, 12, 30)),
      name: "review-loop-20261127-141230",
    },
    {
      lineId: "review-loop",
      startedIso: "2026-01-05T03:04:09Z",
      startedAt: new Date(Date.UTC(2026, 0, 5, 3, 4, 9)),
      name: "review-loop-20260105-030409",
    },
    {
      lineId: "human-approval",
      startedIso: "2026-12-31T23:59:59-05:00",
      startedAt: new Date("2026-12-31T23:59:59-05:00"),
      name: "human-approval-20270101-045959",
    },
  ])("names the run of $lineId started at $startedIso $name", ({ lineId, startedAt, name }) => {
    expect(runFolderName(lineId, startedAt)).toBe(name);
  });
});
