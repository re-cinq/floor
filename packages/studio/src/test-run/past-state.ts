// Pure: the state of a run an earlier studio left in a workspace, rebuilt from what it wrote to disk.
import { bagEntriesOf } from "./run-bag.js";
import type { RunSummary } from "./run-summary.js";
import type { TimelineEntry } from "./timeline.js";
import type { TestRunState } from "./test-run-state.js";
import type { TestLine } from "./test-line.js";
import type { VisitState } from "./test-visit.js";
import type { VisitRecord } from "./visit-record.js";

interface PastFiles {
  records: Record<string, VisitRecord>;
  line?: TestLine;
}

type OpenedVisit = Extract<TimelineEntry, { type: "visit_opened" }>;

export function pastStateOf(folder: string, summary: RunSummary, timeline: TimelineEntry[], { records, line }: PastFiles): TestRunState {
  const settled = summary.status === "settled";
  const opened = timeline.filter((entry): entry is OpenedVisit => entry.type === "visit_opened");
  const visits = opened.map((entry) => visitOf(entry, records[entry.visit]));

  return {
    folder,
    lineId: summary.line,
    status: settled ? summary.status : "stopped",
    ...(settled && summary.ending && { ending: summary.ending }),
    visits,
    actions: {},
    ...(line && { bag: bagEntriesOf({ line, startItems: summary.startItems, visits }) }),
  };
}

function visitOf({ visit, node, iteration, at: openedAt, mode }: OpenedVisit, record: VisitRecord | undefined): VisitState {
  return {
    id: visit,
    nodeId: node,
    iteration,
    station: record?.station ?? null,
    kind: mode === "local" ? "agent" : "stand-in",
    needs: {},
    openedAt,
    report: record ? { outcome: record.outcome, produced: record.produced, error: record.error } : null,
    ...(record && { reportedAt: record.reportedAt, agentDurationMs: record.agentDurationMs, costUsd: record.costUsd }),
  };
}
