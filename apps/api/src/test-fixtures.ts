// Definitions shared by more than one route/engine test file, so a fixture literal lives once.
import type { LineBody, StationBody } from "@floor/store";

export const SERVICE_STATION: StationBody = { kind: "service", outcomes: ["success"], needs: [], produces: [] };

/** One node, at the station named `work`, then done. */
export const WORK_LINE: LineBody = {
  entry: "work",
  exit: "done",
  args: {},
  nodes: [{ id: "work", station: "work" }, { id: "done" }],
  edges: [{ from: "work", to: "done", on: "success" }],
};
