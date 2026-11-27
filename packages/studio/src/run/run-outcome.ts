// Reads how an agent run ended, its final answer and the values it stated, from the final "result" line of its stream-json transcript.
import { readAgentVerdict, requiredVerdict } from "@re-cinq/floor-assembly-lines";
import type { StationBody } from "@re-cinq/floor-contracts";
import { lastResultLine } from "./result-line.js";
import type { RunLine } from "./run-process.js";

interface RunOutcomeInput {
  lines: RunLine[];
  station: StationBody;
}

/** The outcome the agent reported, and its final answer. */
export function runOutcome({ lines, station }: RunOutcomeInput): { outcome: string; answer?: string; error?: string; produced: Record<string, string> } {
  const answer = lastResultLine(lines)?.result;
  const verdict = requiredVerdict(readAgentVerdict(answer, station.outcomes), station);

  return { outcome: verdict.outcome, answer, produced: verdict.produced, ...(verdict.error && { error: verdict.error }) };
}
