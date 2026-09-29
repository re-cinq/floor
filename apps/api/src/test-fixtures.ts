// Definitions shared by more than one route/engine test file, so a fixture literal lives once.
import type { LineBody, StationBody } from "@floor/store";
import type { Deps } from "./deps.js";

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
