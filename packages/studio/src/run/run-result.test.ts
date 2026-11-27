import type { StationBody } from "@re-cinq/floor-contracts";
import { describe, expect, it } from "vitest";
import { runResult } from "./run-result.js";
import { agentStation, workLine } from "./station-fixtures.js";

const endingOfWork = (result: string, station: StationBody) => {
  const lines = [{ stream: "stdout" as const, text: JSON.stringify({ type: "result", result }) }];

  return runResult({ exitCode: 0, lines, station, line: workLine, node: "work", folder: "/nonexistent" });
};

describe("runResult", () => {
  it("ends failed with 'the agent ended without a LORE_NODE_RESULT or REVIEW_RESULT line, and its station requires one' when a result-requiring station's agent says only 'All done.'", async () => {
    const station = { ...agentStation, outcomes: ["success", "failed"], resultRequired: true };

    await expect(endingOfWork("All done.", station)).resolves.toMatchObject({
      outcome: "failed",
      error: "the agent ended without a LORE_NODE_RESULT or REVIEW_RESULT line, and its station requires one",
    });
  });

  it("ends with produced value summary 'three fixes' when the agent's marker states it and the station declares summary as a value", async () => {
    const result = 'Fixed.\nLORE_NODE_RESULT: {"outcome":"success","produced":{"summary":"three fixes"}}';
    const station = { ...agentStation, outcomes: ["success", "failed"], needs: [], produces: [{ name: "summary", kind: "value" as const }] };

    await expect(endingOfWork(result, station)).resolves.toMatchObject({
      outcome: "success",
      producedValues: { summary: "three fixes" },
    });
  });

  it("keeps only summary 'three fixes' when the agent also states draft, which is a file, and secret, which the station does not declare", async () => {
    const result = 'Fixed.\nLORE_NODE_RESULT: {"outcome":"success","produced":{"summary":"three fixes","draft":"not a file","secret":"injected"}}';
    const station = {
      ...agentStation,
      outcomes: ["success", "failed"],
      needs: [],
      produces: [
        { name: "summary", kind: "value" as const },
        { name: "draft", kind: "file" as const, path: "draft.md" },
      ],
    };

    expect((await endingOfWork(result, station)).producedValues).toEqual({ summary: "three fixes" });
  });

  it("ends with only outcome success, no produced files and the edge to done, leaving error and producedValues out, when the agent states no values", async () => {
    const station = { ...agentStation, outcomes: ["success", "failed"], needs: [], produces: [{ name: "summary", kind: "value" as const }] };

    await expect(endingOfWork("Fixed.\nLORE_NODE_RESULT: success", station)).resolves.toEqual({
      outcome: "success",
      produced: [],
      edge: { from: "work", to: "done", on: "success" },
    });
  });
});
