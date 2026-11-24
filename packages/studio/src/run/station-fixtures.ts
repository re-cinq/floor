import type { StationBody } from "@re-cinq/floor-contracts";

export const agentStation: StationBody = { kind: "agent", outcomes: [], needs: [], produces: [] };

export const stationNeeding = (needs: StationBody["needs"]): StationBody => ({ ...agentStation, needs });
