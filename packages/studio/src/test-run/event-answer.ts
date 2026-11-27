// The outcome an event a person sends gives a waiting node: the floor's kernel decides, never Studio.
import { answersOf, type Payload } from "@re-cinq/floor-assembly-lines";
import type { TestLine } from "./test-line.js";
import type { VisitState } from "./test-visit.js";

export interface SentEvent {
  name: string;
  payload: Payload;
}

export function eventOutcomeOf(line: TestLine, nodeId: string, sent: SentEvent): string | undefined {
  return answersOf(line.body, sent.name, sent.payload).find((answer) => answer.nodeId === nodeId)?.outcome;
}

export interface AnsweredVisit {
  visit: VisitState;
  outcome: string;
}

export function answeredVisitsOf(line: TestLine, visits: readonly VisitState[], sent: SentEvent): AnsweredVisit[] {
  const waiting = visits.filter(({ report, kind }) => report === null && kind === "stand-in");

  return waiting.flatMap((visit) => {
    const outcome = eventOutcomeOf(line, visit.nodeId, sent);

    return outcome === undefined ? [] : [{ visit, outcome }];
  });
}
