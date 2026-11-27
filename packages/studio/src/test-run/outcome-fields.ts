// What a person is asked for when they stand in for a station and pick one of its outcomes, and what else the station could produce.
import type { LineNode, NeedSpec, ProduceSpec } from "@re-cinq/floor-contracts";
import { selectEdge } from "@re-cinq/floor-assembly-lines";
import { nodeAt, stationAt, stationBodyOf, walkGraphOfLine, type TestLine } from "./test-line.js";

export interface OutcomeField {
  name: string;
  kind: "value" | "file";
  required: boolean;
}

export function outcomeFieldsOf(line: TestLine, nodeId: string, outcome: string): OutcomeField[] {
  const edge = selectEdge(walkGraphOfLine(line), nodeId, outcome);

  if (!edge) {
    return [];
  }

  const reads = needsReadBy(line, edge.to);
  const { produces } = stationAt(line, nodeId).station;

  return produces
    .filter((produce) => reads.has(produce.name))
    .map(({ name, kind }) => ({ name, kind, required: isRequired(reads.get(name)!) }));
}

export function otherOutputsOf(produces: ProduceSpec[], fields: OutcomeField[]): OutcomeField[] {
  const named = new Set(fields.map((field) => field.name));

  return produces
    .filter((produce) => !named.has(produce.name))
    .map(({ name, kind }) => ({ name, kind, required: false }));
}

function needsReadBy(line: TestLine, targetId: string): Map<string, NeedSpec> {
  const target = nodeAt(line, targetId);
  const reads = new Map<string, NeedSpec>();

  for (const need of stationBodyOf(line, target)?.needs ?? []) {
    reads.set(bagNameOf(target, need), need);
  }

  return reads;
}

function bagNameOf(node: LineNode, need: NeedSpec): string {
  const { bind } = node;

  return bind && Object.hasOwn(bind, need.name) ? bind[need.name]! : need.name;
}

function isRequired(need: NeedSpec): boolean {
  return !need.optional || need.fresh === true;
}
