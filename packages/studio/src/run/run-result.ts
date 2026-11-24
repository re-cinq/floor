// Works out what a finished agent run produced: its outcome, the files it left and the edge the floor would take.
import type { LineBody, StationBody } from "@re-cinq/floor-contracts";
import { edgeTaken } from "./run-edge.js";
import { runOutcome } from "./run-outcome.js";
import type { RunLine } from "./run-process.js";
import { producesFound } from "./run-produces.js";
import type { RunEnding } from "./run-records.js";

interface RunResultInput {
  exitCode: number | null;
  lines: RunLine[];
  station: StationBody;
  line: LineBody;
  node: string;
  folder: string;
}

export async function runResult({ exitCode, lines, station, line, node, folder }: RunResultInput): Promise<Omit<RunEnding, "exitCode">> {
  if (exitCode === null) return {};

  const { outcome } = runOutcome({ lines, station });

  return { outcome, produced: await producesFound({ station, folder }), edge: edgeTaken({ line, node, outcome }) };
}
