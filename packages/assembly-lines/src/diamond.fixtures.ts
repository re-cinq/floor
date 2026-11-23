import type { LineBody, NeedSpec, ProduceSpec, StationBody } from "@re-cinq/floor-contracts";

export function agentStation(needs: NeedSpec[], produces: ProduceSpec[] = []): StationBody {
  return { kind: "agent", outcomes: ["success", "failed"], needs, produces };
}

/** The stations of the diamond line: opener produces ticket, skipper and start produce nothing, reader reads ticket. */
export const DIAMOND_STATIONS: ReadonlyMap<string, StationBody> = new Map([
  ["opener", agentStation([], [{ name: "ticket", kind: "value" }])],
  ["skipper", agentStation([])],
  ["reader", agentStation([{ name: "ticket", kind: "value" }])],
]);

/** start goes to opener on success and to skipper on failed; both lead to join, which reads. Only the opener branch produces ticket. */
export function diamondLine(patch: Partial<LineBody> = {}): LineBody {
  return {
    entry: "start",
    exit: "done",
    args: {},
    nodes: [
      { id: "start", station: "skipper" },
      { id: "opener", station: "opener" },
      { id: "skipper", station: "skipper" },
      { id: "join", station: "reader" },
      { id: "done" },
    ],
    edges: [
      { from: "start", to: "opener", on: "success" },
      { from: "start", to: "skipper", on: "failed" },
      { from: "opener", to: "join", on: "success" },
      { from: "skipper", to: "join", on: "success" },
      { from: "join", to: "done", on: "success" },
    ],
    ...patch,
  };
}
