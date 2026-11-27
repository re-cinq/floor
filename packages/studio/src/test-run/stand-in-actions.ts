// What a waiting visit offers a person: the outcomes they can report and the events they can send.
import type { LineNode, WhenValue } from "@re-cinq/floor-contracts";
import { otherOutputsOf, outcomeFieldsOf, type OutcomeField } from "./outcome-fields.js";
import { stationAt, type TestLine } from "./test-line.js";
import type { VisitState } from "./test-visit.js";

export type StandInAction =
  | { kind: "report"; outcome: string; fields: OutcomeField[]; others: OutcomeField[] }
  | { kind: "event"; outcome: string; event: string; payload: Record<string, WhenValue> };

export function standInActionsOf(line: TestLine, nodeId: string): StandInAction[] {
  const { node, station } = stationAt(line, nodeId);
  const reports = node.reports ?? [];

  return [...eventActionsOf(reports), ...reportActionsOf(line, nodeId, station.outcomes, reports)];
}

export function waitingActionsOf(line: TestLine, visits: VisitState[]): Record<string, StandInAction[]> {
  const waiting = visits.filter(({ kind, report }) => kind === "stand-in" && report === null);

  return Object.fromEntries(waiting.map(({ id, nodeId }) => [id, standInActionsOf(line, nodeId)]));
}

function eventActionsOf(reports: NonNullable<LineNode["reports"]>): StandInAction[] {
  return reports.map((entry) => ({ kind: "event", outcome: entry.outcome, event: entry.on, payload: entry.when ?? {} }));
}

function reportActionsOf(
  line: TestLine,
  nodeId: string,
  outcomes: string[],
  reports: NonNullable<LineNode["reports"]>,
): StandInAction[] {
  const answered = reports.map((entry) => entry.outcome);

  return outcomes
    .filter((outcome) => !answered.includes(outcome))
    .map((outcome) => reportActionOf(line, nodeId, outcome));
}

function reportActionOf(line: TestLine, nodeId: string, outcome: string): StandInAction {
  const fields = outcomeFieldsOf(line, nodeId, outcome);
  const others = otherOutputsOf(stationAt(line, nodeId).station.produces, fields);

  return { kind: "report", outcome, fields, others };
}
