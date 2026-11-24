import { describe, expect, it } from "vitest";
import { runOutcome } from "./run-outcome.js";
import { agentStation } from "./station-fixtures.js";

describe("runOutcome", () => {
  it("returns failed for a result line ending in LORE_NODE_RESULT: failed", () => {
    const lines = [
      { stream: "stdout" as const, text: JSON.stringify({ type: "system" }) },
      { stream: "stdout" as const, text: JSON.stringify({ type: "result", result: "Done.\nLORE_NODE_RESULT: failed" }) },
    ];

    expect(runOutcome({ lines, station: { ...agentStation, outcomes: ["success", "failed"] } })).toMatchObject({ outcome: "failed" });
  });

  it("returns failed for a required result when the result text is All done. with no verdict line", () => {
    const lines = [{ stream: "stdout" as const, text: JSON.stringify({ type: "result", result: "All done." }) }];
    const station = { ...agentStation, outcomes: ["success", "failed"], resultRequired: true };

    expect(runOutcome({ lines, station })).toMatchObject({ outcome: "failed" });
  });
});
