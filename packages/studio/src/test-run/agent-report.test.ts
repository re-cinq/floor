import type { Report } from "@re-cinq/floor-contracts";
import { describe, expect, it } from "vitest";
import type { RunEnding } from "../run/run-records.js";
import { agentReportOf } from "./agent-report.js";

const draftPath = "/runs/r1/visits/001-write-1/outputs/draft.md";
const missingResultError = "the agent ended without a LORE_NODE_RESULT or REVIEW_RESULT line, and its station requires one";

describe("agentReportOf", () => {
  it.each<{ why: string; ending: RunEnding; report: Report }>([
    {
      why: "claude could not be started",
      ending: { exitCode: null, error: "could not start claude: spawn claude ENOENT" },
      report: { outcome: "failed", error: "could not start claude: spawn claude ENOENT" },
    },
    {
      why: "the run was cancelled",
      ending: { exitCode: null },
      report: { outcome: "failed", error: "the agent run was cancelled" },
    },
    {
      why: "claude exited with code 1 although it said success",
      ending: { exitCode: 1, outcome: "success", producedValues: { summary: "three fixes" } },
      report: { outcome: "failed", error: "the agent exited with code 1" },
    },
    {
      why: "the station requires a result and got none",
      ending: { exitCode: 0, outcome: "failed", error: missingResultError },
      report: { outcome: "failed", error: missingResultError },
    },
    {
      why: "the agent itself reported failed, with no reason",
      ending: { exitCode: 0, outcome: "failed" },
      report: { outcome: "failed" },
    },
  ])("reports failed when $why", ({ ending, report }) => {
    expect(agentReportOf(ending, { draft: draftPath })).toEqual(report);
  });

  it.each<{ why: string; ending: RunEnding; report: Report }>([
    {
      why: "the run ended cleanly with no outcome",
      ending: { exitCode: 0 },
      report: { outcome: "failed", error: "the agent run gave no outcome" },
    },
    {
      why: "the agent reported failed after stating a summary",
      ending: { exitCode: 0, outcome: "failed", error: "the tests do not pass", producedValues: { summary: "three fixes" } },
      report: { outcome: "failed", error: "the tests do not pass" },
    },
  ])("reports failed with nothing produced when $why", ({ ending, report }) => {
    expect(agentReportOf(ending, { draft: draftPath })).toEqual(report);
  });

  it.each<{ why: string; ending: RunEnding; savedOutputs: Record<string, string>; report: Report }>([
    {
      why: "a draft was saved",
      ending: { exitCode: 0, outcome: "success", produced: [{ name: "draft", found: true }] },
      savedOutputs: { draft: draftPath },
      report: { outcome: "success", produced: { draft: draftPath } },
    },
    {
      why: "a value was stated and a file saved",
      ending: {
        exitCode: 0,
        outcome: "success",
        producedValues: { summary: "three fixes" },
        produced: [{ name: "draft", found: true }],
      },
      savedOutputs: { draft: draftPath },
      report: { outcome: "success", produced: { summary: "three fixes", draft: draftPath } },
    },
    {
      why: "the declared draft was not left",
      ending: { exitCode: 0, outcome: "success", produced: [{ name: "draft", found: false }] },
      savedOutputs: {},
      report: { outcome: "success" },
    },
    {
      why: "the agent chose another outcome",
      ending: { exitCode: 0, outcome: "needs_work" },
      savedOutputs: {},
      report: { outcome: "needs_work" },
    },
  ])("reports $report.outcome when $why", ({ ending, savedOutputs, report }) => {
    expect(agentReportOf(ending, savedOutputs)).toEqual(report);
  });
});
