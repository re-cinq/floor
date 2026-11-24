// What the backend remembers of each run: its transcript, how it ended, and its process while it runs.
import type { RunLine, RunningProcess } from "./run-process.js";

export interface RunRecord {
  lines: RunLine[];
  ended?: { exitCode: number | null };
  process?: RunningProcess;
}

export function appendLine(record: RunRecord, line: RunLine): void {
  record.lines.push(line);
}

export function endRecord(record: RunRecord, exitCode: number | null): void {
  record.ended = { exitCode };
  record.process = undefined;
}

export function readRecord({ lines, ended }: RunRecord, after: number): { lines: RunLine[]; ended?: { exitCode: number | null } } {
  return { lines: lines.slice(after), ...(ended && { ended }) };
}
