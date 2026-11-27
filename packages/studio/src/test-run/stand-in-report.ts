// The visit report a person's answer makes when they stand in for a station.
import type { LineNode, Report, StationBody } from "@re-cinq/floor-contracts";
import { enforce } from "@re-cinq/floor-assembly-lines";
import { enteredValue } from "./entered-value.js";
import { outcomeFieldsOf } from "./outcome-fields.js";
import { stationAt, type TestLine } from "./test-line.js";

export type SuppliedFile = { picked: string } | { pasted: string };

export interface StandInAnswer {
  outcome: string;
  produced: Readonly<Record<string, string>>;
  files?: Readonly<Record<string, SuppliedFile>>;
}

export function standInReport(line: TestLine, nodeId: string, answer: StandInAnswer): Report {
  const { node, station } = stationAt(line, nodeId);
  const { outcome } = answer;
  enforceStationHasOutcome(node, station, outcome);
  enforceRequiredFieldsEntered(line, nodeId, answer);
  enforceSuppliedFilesAreDeclared(node, station, answer);

  const produced = enteredProduces(station.produces, answer.produced);

  return Object.keys(produced).length === 0 ? { outcome } : { outcome, produced };
}

function enforceStationHasOutcome(node: LineNode, station: StationBody, outcome: string): void {
  enforce(
    station.outcomes.includes(outcome),
    `${node.id} cannot report ${outcome}: its station ${node.station} has the outcomes ${station.outcomes.join(", ")}`,
  );
}

function enforceRequiredFieldsEntered(line: TestLine, nodeId: string, answer: StandInAnswer): void {
  for (const field of outcomeFieldsOf(line, nodeId, answer.outcome)) {
    enforce(
      !field.required || isEntered(answer, field.name),
      `${field.name} is required when ${nodeId} reports ${answer.outcome}`,
    );
  }
}

function isEntered(answer: StandInAnswer, name: string): boolean {
  return enteredValue(answer.produced, name) !== undefined || Object.hasOwn(answer.files ?? {}, name);
}

function enforceSuppliedFilesAreDeclared(node: LineNode, station: StationBody, answer: StandInAnswer): void {
  for (const name of Object.keys(answer.files ?? {})) {
    enforce(
      station.produces.some((declared) => declared.name === name && declared.kind === "file"),
      `${name} is not a file output of station ${node.station}`,
    );
  }
}

function enteredProduces(
  declared: readonly { name: string }[],
  entered: StandInAnswer["produced"],
): Record<string, string> {
  const pairs = declared.map(({ name }) => [name, enteredValue(entered, name)] as const);

  return Object.fromEntries(pairs.filter((pair): pair is readonly [string, string] => pair[1] !== undefined));
}
