import type { LineBody, StationBody } from "@re-cinq/floor-contracts";

export const agentStation: StationBody = { kind: "agent", outcomes: [], needs: [], produces: [] };

export const stationNeeding = (needs: StationBody["needs"]): StationBody => ({ ...agentStation, needs });

export const workLine: LineBody = {
  entry: "work",
  exit: "done",
  fail: "fail",
  args: {},
  nodes: [{ id: "work", station: "worker" }, { id: "done" }, { id: "fail" }],
  edges: [
    { from: "work", to: "done", on: "success" },
    { from: "work", to: "fail", on: "failed" },
  ],
};
