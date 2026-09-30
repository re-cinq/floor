// Definitions shared by more than one route/engine test file, so a fixture literal lives once.
import type { LineBody, StationBody } from "@floor/store";
import type { Deps } from "./deps.js";
import { Dispatcher } from "./engine/dispatcher.js";

const MAX_DISPATCH_TICKS = 20;

export const SERVICE_STATION: StationBody = { kind: "service", outcomes: ["success"], needs: [], produces: [] };

/** One node, at the station named `work`, then done. */
export const WORK_LINE: LineBody = {
  entry: "work",
  exit: "done",
  args: {},
  nodes: [{ id: "work", station: "work" }, { id: "done" }],
  edges: [{ from: "work", to: "done", on: "success" }],
};

/** A run of the work line on repository `r`, its one visit opened. */
export async function workStarted(deps: Pick<Deps, "definitions" | "runs">): Promise<{ runId: string; visitId: string }> {
  await deps.definitions.put("station", "work", SERVICE_STATION);
  await deps.definitions.put("line", "line", WORK_LINE);
  const { run } = await deps.runs.start({ lineId: "line", repo: "r", startItems: {} });
  const { visit } = await deps.runs.openVisit(run.id, "work", 1);

  return { runId: run.id, visitId: visit.id };
}

/** Drains the queue through a real Dispatcher, for a test that needs the walk to actually advance (a node opened, a marker auto-reported, a run settled) rather than poking the store directly. */
export async function tickDispatcherUntilIdle(deps: Pick<Deps, "runs" | "events" | "outside" | "schedules">): Promise<void> {
  const dispatcher = new Dispatcher({ runs: deps.runs, events: deps.events, outside: deps.outside, schedules: deps.schedules, claimedBy: "test-dispatcher" });

  for (let tick = 0; tick < MAX_DISPATCH_TICKS; tick++) {
    if ((await dispatcher.tick()) === 0) return;
  }
}
