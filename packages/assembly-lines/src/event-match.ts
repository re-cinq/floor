// Pure: whether an event payload satisfies a `when` condition, whether an event starts a line, and which waiting nodes an event answers.
import type { LineBody, WhenValue } from "@re-cinq/floor-contracts";

export type Payload = Record<string, unknown>;

export function matchesWhen(when: Record<string, WhenValue> | undefined, payload: Payload): boolean {
  return Object.entries(when ?? {}).every(([field, expected]) => Object.hasOwn(payload, field) && String(payload[field]) === String(expected));
}

export function startsOn(line: LineBody, eventName: string, payload: Payload): boolean {
  const start = line.start;

  return Boolean(start?.on.includes(eventName)) && matchesWhen(start?.when, payload);
}

export interface Answer {
  nodeId: string;
  outcome: string;
}

/** One answer per node at most: the first of its `reports` this event satisfies. */
export function answersOf(line: LineBody, eventName: string, payload: Payload): Answer[] {
  return line.nodes.flatMap((node) => {
    const report = node.reports?.find((candidate) => candidate.on === eventName && matchesWhen(candidate.when, payload));

    return report ? [{ nodeId: node.id, outcome: report.outcome }] : [];
  });
}
