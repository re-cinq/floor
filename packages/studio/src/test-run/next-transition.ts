// What happens next in a local test run: the floor's routing kernel decides, never Studio.
import { getNextTransition, type NodeVisit, type Transition } from "@re-cinq/floor-assembly-lines";
import { walkGraphOfLine } from "./test-line.js";
import type { TestRun, TestVisit } from "./test-visit.js";

export function nextTransitionOf(run: TestRun): Transition {
  return getNextTransition(walkGraphOfLine(run.line), run.visits.map(nodeVisitOf));
}

function nodeVisitOf(visit: TestVisit): NodeVisit {
  return { nodeId: visit.nodeId, iteration: visit.iteration, outcome: visit.report?.outcome ?? null };
}
