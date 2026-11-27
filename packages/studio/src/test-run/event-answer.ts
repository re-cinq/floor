// The outcome an event a person sends gives a waiting node: the floor's kernel decides, never Studio.
import { answersOf, type Payload } from "@re-cinq/floor-assembly-lines";
import type { TestLine } from "./test-line.js";

export interface SentEvent {
  name: string;
  payload: Payload;
}

export function eventOutcomeOf(line: TestLine, nodeId: string, sent: SentEvent): string | undefined {
  return answersOf(line.body, sent.name, sent.payload).find((answer) => answer.nodeId === nodeId)?.outcome;
}
