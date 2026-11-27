// The time and cost of a test run, per station and in all.
export interface VisitMeasure {
  nodeId: string;
  mode: "local" | "simulated";
  durationMs?: number;
  costUsd?: number;
}

export interface Tally {
  visits: number;
  durationMs: number;
  costUsd: number;
  costUnstated: number;
}

export interface RunTotals {
  run: Tally;
  nodes: (Tally & { nodeId: string })[];
}

const MICRO_DOLLARS_PER_DOLLAR = 1_000_000;

export function totalsOf(visits: readonly VisitMeasure[]): RunTotals {
  const nodes = [...visitsByNode(visits)].map(([nodeId, nodeVisits]) => ({ nodeId, ...tallyOf(nodeVisits) }));

  return { run: tallyOf(visits), nodes };
}

function visitsByNode(visits: readonly VisitMeasure[]): Map<string, VisitMeasure[]> {
  const grouped = new Map<string, VisitMeasure[]>();

  for (const visit of visits) {
    grouped.set(visit.nodeId, [...(grouped.get(visit.nodeId) ?? []), visit]);
  }

  return grouped;
}

function tallyOf(visits: readonly VisitMeasure[]): Tally {
  const durationMs = visits.reduce((sum, visit) => sum + (visit.durationMs ?? 0), 0);
  const costUsd = visits.reduce((sum, visit) => sum + (visit.costUsd ?? 0), 0);

  return {
    visits: visits.length,
    durationMs,
    costUsd: Math.round(costUsd * MICRO_DOLLARS_PER_DOLLAR) / MICRO_DOLLARS_PER_DOLLAR,
    costUnstated: visits.filter(isCostUnstated).length,
  };
}

function isCostUnstated(visit: VisitMeasure): boolean {
  return visit.mode === "local" && visit.durationMs !== undefined && visit.costUsd === undefined;
}
