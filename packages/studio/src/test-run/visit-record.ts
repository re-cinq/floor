// Pure: the record of a reported visit of a local test run, as visits/<id>/visit.json keeps it.
import type { Report } from "@re-cinq/floor-contracts";
import { selectEdge } from "@re-cinq/floor-assembly-lines";
import { walkGraphOfLine, type TestLine } from "./test-line.js";
import type { VisitState } from "./test-visit.js";
import { modeOf } from "./timeline.js";

export interface VisitRecord {
  id: string;
  node: string;
  station: string | null;
  iteration: number;
  mode: "local" | "simulated";
  openedAt: string;
  reportedAt: string;
  durationMs: number;
  agentDurationMs?: number;
  costUsd?: number;
  outcome: string;
  produced?: Record<string, string>;
  error?: string;
  next?: string;
}

export function visitRecordOf(line: TestLine, visit: VisitState, { outcome, produced, error }: Report): VisitRecord {
  const { id, nodeId, station, iteration, kind, openedAt, agentDurationMs, costUsd } = visit;
  const reportedAt = visit.reportedAt as string;
  const next = selectEdge(walkGraphOfLine(line), nodeId, outcome)?.to;

  return {
    id,
    node: nodeId,
    station,
    iteration,
    mode: modeOf(kind),
    openedAt,
    reportedAt,
    durationMs: Date.parse(reportedAt) - Date.parse(openedAt),
    outcome,
    ...statedOnly({ agentDurationMs, costUsd, produced, error, next }),
  };
}

function statedOnly(optional: Partial<Record<keyof VisitRecord, unknown>>): Partial<VisitRecord> {
  return Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined));
}
