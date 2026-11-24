// The lines an assembly run took, for the graph to mark; undefined while no run is shown.
import { useMemo } from "react";
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import { stationVisitsOf } from "./metro/station-visits";
import { takenLinesOf, type Visit } from "./metro/taken-lines";

export interface RunOverlay {
  visits: readonly Visit[];
}

export function useTakenLines(
  definition: AssemblyLineDefinition,
  run: RunOverlay | undefined,
) {
  return useMemo(
    () => run && takenLinesOf(definition, run.visits),
    [definition, run],
  );
}

export function useStationVisits(run: RunOverlay | undefined) {
  return useMemo(() => run && stationVisitsOf(run.visits), [run]);
}
