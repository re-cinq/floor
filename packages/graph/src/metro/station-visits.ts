// What a run did at each station: how often it came, and how its last closed visit ended.
import type { Visit } from "./taken-lines";

export interface StationVisits {
  count: number;
  outcome?: string;
  open: boolean;
}

export function stationVisitsOf(
  visits: readonly Visit[],
): ReadonlyMap<string, StationVisits> {
  return [...visits]
    .sort((earlier, later) => earlier.iteration - later.iteration)
    .reduce(
      (stations, visit) =>
        stations.set(
          visit.nodeId,
          afterVisit(stations.get(visit.nodeId), visit),
        ),
      new Map<string, StationVisits>(),
    );
}

function afterVisit(
  before: StationVisits | undefined,
  visit: Visit,
): StationVisits {
  return {
    count: (before?.count ?? 0) + 1,
    outcome: visit.open ? before?.outcome : visit.outcome,
    open: visit.open,
  };
}
