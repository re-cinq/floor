// Pure: the record of a reported visit of a local test run, as visits/<id>/visit.json keeps it.
import type { Report } from "@re-cinq/floor-contracts";
import { selectEdge } from "@re-cinq/floor-assembly-lines";
import { walkGraphOfLine, type TestLine } from "./test-line.js";
import type { VisitState } from "./test-visit.js";
import { modeOf, type VisitMode } from "./timeline.js";

export interface VisitRecord {
  id: string;
  node: string;
  station: string | null;
  iteration: number;
  mode: VisitMode;
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
    durationMs: wallTimeOf(openedAt, reportedAt),
    outcome,
    ...statedOnly({ agentDurationMs, costUsd, produced, error, next }),
  };
}

export function wallTimeOf(openedAt: string, reportedAt: string): number {
  return Date.parse(reportedAt) - Date.parse(openedAt);
}

type OptionalRecordField = "agentDurationMs" | "costUsd" | "produced" | "error" | "next";
type MaybeStated = { [Field in OptionalRecordField]: VisitRecord[Field] | undefined };

function statedOnly(optional: MaybeStated): Partial<MaybeStated> {
  return Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined));
}
