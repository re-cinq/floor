// What the backend remembers of each run: its transcript, how it ended, and its process while it runs.
import type { LineEdge } from "@re-cinq/floor-contracts";
import type { RunLine, RunningProcess } from "./run-process.js";

export interface RunEnding {
  exitCode: number | null;
  /** Why the floor failed the run. */
  error?: string;
  /** The outcome the floor would take from the visit. */
  outcome?: string;
  /** The values the agent stated for the station's declared value produces. */
  producedValues?: Record<string, string>;
  /** Each declared file produce and whether the run left it. */
  produced?: { name: string; found: boolean }[];
  /** The line edge the floor would follow from this outcome. */
  edge?: LineEdge;
  /** What the run cost in US dollars. */
  costUsd?: number;
  /** How long the run took in milliseconds. */
  durationMs?: number;
}

/** The part of a record a page reads back. */
export interface RunTranscript {
  lines: RunLine[];
  ended?: RunEnding;
}

export interface RunRecord extends RunTranscript {
  process?: RunningProcess;
}

export function appendLine(record: RunRecord, line: RunLine): void {
  record.lines.push(line);
}

export function endRecord(record: RunRecord, ending: RunEnding): void {
  record.ended = ending;
  record.process = undefined;
}

export function readRecord({ lines, ended }: RunRecord, after: number): RunTranscript {
  return { lines: lines.slice(after), ...(ended && { ended }) };
}
