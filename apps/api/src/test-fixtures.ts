// Definitions shared by more than one route/engine test file, so a fixture literal lives once.
import type { StationBody } from "@floor/store";

export const SERVICE_STATION: StationBody = { kind: "service", outcomes: ["success"], needs: [], produces: [] };
