// Works out what a finished agent run produced: its outcome, the files it left and the edge the floor would take.
import type { LineBody, StationBody } from "@re-cinq/floor-contracts";
import { runCost } from "./run-cost.js";
import { edgeTaken } from "./run-edge.js";
import { runOutcome } from "./run-outcome.js";
import type { RunLine } from "./run-process.js";
import { producesFound, valuesStated } from "./run-produces.js";
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

  const { outcome, answer, error, produced } = runOutcome({ lines, station });

  return {
    outcome,
    ...presentWhenFilled("error", error),
    ...presentWhenFilled("producedValues", valuesStated({ station, stated: produced })),
    produced: await producesFound({ station, folder, answer }),
    edge: edgeTaken({ line, node, outcome }),
    ...runCost(lines),
  };
}

function presentWhenFilled<Key extends string, Value extends string | object>(key: Key, value: Value | undefined): { [Name in Key]?: Value } {
  const isFilled = typeof value === "string" ? value !== "" : value !== undefined && Object.keys(value).length > 0;

  return isFilled ? ({ [key]: value } as { [Name in Key]?: Value }) : {};
}
