// The visit report an agent run's ending makes.
import type { Report } from "@re-cinq/floor-contracts";
import type { RunEnding } from "../run/run-records.js";

const cleanExitCode = 0;
const cancelledError = "the agent run was cancelled";
const noOutcomeError = "the agent run gave no outcome";

export function agentReportOf(ending: RunEnding, savedOutputs: Readonly<Record<string, string>>): Report {
  const unfinished = whyUnfinished(ending);
  if (unfinished !== undefined) return { outcome: "failed", error: unfinished };

  const { outcome, error } = ending;
  if (outcome === "failed") return { outcome, ...(error !== undefined && { error }) };
  if (outcome === undefined) return { outcome: "failed", error: noOutcomeError };

  const produced = { ...ending.producedValues, ...savedOutputs };

  return Object.keys(produced).length === 0 ? { outcome } : { outcome, produced };
}

function whyUnfinished({ exitCode, error }: RunEnding): string | undefined {
  if (exitCode === null) return error ?? cancelledError;

  return exitCode === cleanExitCode ? undefined : `the agent exited with code ${exitCode}`;
}
