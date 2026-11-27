// The brief of a visit: what a station receives when a node of a line is opened in a local test run.
import { needItemsOf, previousErrorNeed, previousFailuresNeed, visitIdsSincePersonActed } from "@re-cinq/floor-assembly-lines";
import { bagOfRun } from "./run-bag.js";
import { stationAt, walkGraphOfLine } from "./test-line.js";
import type { TestRun } from "./test-visit.js";
import { visitKindOf } from "./visit-kind.js";

export interface Brief {
  needs: Record<string, string>;
  missing: string[];
}

export function briefOf(run: TestRun, nodeId: string): Brief {
  const { node, station } = stationAt(run.line, nodeId);
  const bag = bagOfRun(run);
  const fresh = visitIdsSincePersonActed(walkGraphOfLine(run.line), run.visits);
  const { items: supplied, missing } = needItemsOf(station.needs, node.bind, bag, fresh);
  const declared = Object.fromEntries(Object.entries(supplied).map(([name, found]) => [name, found.ref]));
  const failureContext = visitKindOf(run.line, nodeId) === "agent" ? failureContextOf(run, nodeId) : {};

  return { needs: { ...declared, ...failureContext }, missing };
}

function failureContextOf(run: TestRun, nodeId: string): Record<string, string> {
  const failedVisits = run.visits.filter((visit) => visit.nodeId === nodeId && visit.report?.outcome === "failed");
  const priorErrors = failedVisits.map((visit) => visit.report?.error).reverse();
  const previousError = previousErrorNeed(priorErrors[0]);
  const previousFailures = previousFailuresNeed(priorErrors);

  return {
    ...(previousError === undefined ? {} : { previous_error: previousError }),
    ...(previousFailures === undefined ? {} : { previous_failures: previousFailures }),
  };
}
