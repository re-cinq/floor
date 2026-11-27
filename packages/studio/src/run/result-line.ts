// Finds the final "result" line of an agent's stream-json transcript.
import type { RunLine } from "./run-process.js";

export interface ResultLine {
  result?: string;
  [field: string]: unknown;
}

interface AgentLine extends ResultLine {
  type?: string;
}

export function lastResultLine(lines: RunLine[]): ResultLine | undefined {
  return lines
    .filter(({ stream }) => stream === "stdout")
    .map(({ text }) => parseJsonLine(text))
    .filter((parsed) => parsed?.type === "result")
    .at(-1);
}

function parseJsonLine(text: string): AgentLine | undefined {
  if (!text.startsWith("{")) return undefined;

  try {
    return JSON.parse(text) as AgentLine;
  } catch {
    return undefined;
  }
}
