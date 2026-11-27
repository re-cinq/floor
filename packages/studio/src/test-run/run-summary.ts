// Pure: the summary of a local test run, as run.json keeps it.
import type { Item } from "@re-cinq/floor-contracts";
import { modeOf } from "./timeline.js";
import { totalsOf, type RunTotals, type VisitMeasure } from "./totals.js";
import type { TestRunState } from "./test-run-state.js";
import type { VisitState } from "./test-visit.js";
import { wallTimeOf } from "./visit-record.js";

export interface RunSummary {
  line: string;
  startedAt: string;
  startItems: Record<string, Item>;
  status: TestRunState["status"];
  ending?: TestRunState["ending"];
  totals: RunTotals;
}

export type RunProgress = Pick<TestRunState, "lineId" | "status" | "ending" | "visits">;

export function runSummaryOf(startedAt: string, startItems: Record<string, Item>, progress: RunProgress): RunSummary {
  const { lineId, status, ending, visits } = progress;

  return {
    line: lineId,
    startedAt,
    startItems,
    status,
    ...(ending ? { ending } : {}),
    totals: totalsOf(visits.map(measureOf)),
  };
}

function measureOf({ nodeId, kind, openedAt, reportedAt, costUsd }: VisitState): VisitMeasure {
  return {
    nodeId,
    mode: modeOf(kind),
    durationMs: reportedAt === undefined ? undefined : wallTimeOf(openedAt, reportedAt),
    costUsd,
  };
}
