import { describe, expect, it } from "vitest";
import { FAN_STATIONS, fanLine } from "@floor/store";
import { setupTestServer } from "../test-server.js";
import { DispatcherScene } from "./dispatcher.fixtures.js";

const { deps } = setupTestServer();
const { tickUntilIdle, postedThenHandled } = new DispatcherScene(deps);

async function runSplit(listed: string[]): Promise<string> {
  await deps().definitions.put("line", "line", fanLine());
  for (const [id, body] of Object.entries(FAN_STATIONS)) await deps().definitions.put("station", id, body);
  const { run } = await deps().runs.start({ lineId: "line", repo: "r", startItems: {} });

  await tickUntilIdle();
  const [entry] = await deps().runs.visits(run.id);

  await postedThenHandled("station_run.reported", { visitId: entry!.id, report: { outcome: "success", produced: { items: JSON.stringify(listed) } } });

  return run.id;
}

async function visitLabels(runId: string): Promise<string[]> {
  const visits = await deps().runs.visits(runId);

  return visits.map((visit) => `${visit.nodeId}#${visit.iteration}.${visit.branch ?? "-"}`);
}

describe("Dispatcher: a fan-out", () => {
  it("opens one visit of the body per entry, each on its own branch", async () => {
    const runId = await runSplit(["a", "b", "c"]);

    expect(await visitLabels(runId)).toEqual(["split#1.-", "work#1.0", "work#1.1", "work#1.2"]);
  });

  it("gives each branch its entry as the item need", async () => {
    const runId = await runSplit(["a", "b"]);
    const visits = await deps().runs.visits(runId);

    const branches = visits.filter((visit) => visit.nodeId === "work");

    expect(branches.map(({ brief }) => brief.needs.item)).toEqual(["a", "b"]);
  });

  it("opens the join with every branch's result once the last has reported", async () => {
    const runId = await runSplit(["a", "b"]);
    const branches = (await deps().runs.visits(runId)).filter((visit) => visit.nodeId === "work");

    for (const [index, branch] of branches.entries()) {
      await postedThenHandled("station_run.reported", { visitId: branch.id, report: { outcome: "success", produced: { result: `r${index}` } } });
    }

    const merge = (await deps().runs.visits(runId)).find((visit) => visit.nodeId === "merge");
    const { needs } = merge!.brief;

    expect(JSON.parse(needs.results!)).toEqual(["r0", "r1"]);
  });
});
