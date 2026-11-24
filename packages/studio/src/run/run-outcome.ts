// Reads how an agent run ended from the final "result" line of its stream-json transcript.
import { readAgentVerdict, requiredVerdict } from "@re-cinq/floor-assembly-lines";
import type { StationBody } from "@re-cinq/floor-contracts";
import type { RunLine } from "./run-process.js";

interface RunOutcomeInput {
  lines: RunLine[];
  station: StationBody;
}

export function runOutcome({ lines, station }: RunOutcomeInput): { outcome: string } {
  const verdict = requiredVerdict(readAgentVerdict(finalAgentText(lines), station.outcomes), station);

  return { outcome: verdict.outcome };
}

function finalAgentText(lines: RunLine[]): string | undefined {
  const results = lines
    .filter(({ stream }) => stream === "stdout")
    .map(({ text }) => parseJsonLine(text))
    .filter((parsed) => parsed?.type === "result");

  return results.at(-1)?.result;
}

function parseJsonLine(text: string): { type?: string; result?: string } | undefined {
  if (!text.startsWith("{")) return undefined;

  try {
    return JSON.parse(text) as { type?: string; result?: string };
  } catch {
    return undefined;
  }
}
