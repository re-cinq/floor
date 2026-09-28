import { describe, expect, it } from "vitest";
import type { LineBody, StationBody, Visit } from "@floor/store";
import { setupTestServer } from "../test-server.js";
import { SERVICE_STATION } from "../test-fixtures.js";
import { Sweeper } from "./sweep.js";

const { deps } = setupTestServer();

const HUMAN_STATION: StationBody = { kind: "human", outcomes: ["success"], needs: [], produces: [] };

const WORK_LINE: LineBody = {
  entry: "work",
  exit: "done",
  args: {},
  nodes: [{ id: "work", station: "work" }, { id: "recover" }, { id: "done" }],
  edges: [
    { from: "work", to: "done", on: "success" },
    { from: "work", to: "recover", on: "failed" },
    { from: "recover", to: "done", on: "always" },
  ],
};

function sweeper(): Sweeper {
  return new Sweeper({ runs: deps().runs, events: deps().events, now: deps().now });
}

async function startWork(workStation: StationBody): Promise<{ runId: string; visit: Visit }> {
  await deps().definitions.put("line", "line", WORK_LINE);
  await deps().definitions.put("station", "work", workStation);
  const { run } = await deps().runs.start({ lineId: "line", repo: "r", startItems: {} });
  const { visit } = await deps().runs.openVisit(run.id, "work", 1);

  return { runId: run.id, visit };
}

async function overdueVisitScenario(): Promise<{ runId: string; visit: Visit }> {
  const { runId, visit } = await startWork(SERVICE_STATION);

  await backdateVisitDeadline(visit.id, past(1));

  return { runId, visit };
}

async function backdateVisitDeadline(visitId: string, deadline: Date): Promise<void> {
  await deps().pool.query(`update station_runs set deadline = $1 where station_run_id = $2`, [deadline, visitId]);
}

function past(minutes: number): Date {
  return new Date(deps().now().getTime() - minutes * 60_000);
}

describe("Sweeper: overdue visits", () => {
  it("fails an overdue visit as a timeout", async () => {
    const { visit } = await overdueVisitScenario();

    await sweeper().sweep();
    const swept = await deps().runs.visit(visit.id);

    expect(swept!.report).toEqual({ outcome: "failed", error: "timeout" });
  });

  it("makes the run follow the failed edge, not the success one", async () => {
    const { runId } = await overdueVisitScenario();

    await sweeper().sweep();
    const runEvents = await deps().events.listByRun(runId);

    expect(runEvents.map((event) => event.name)).toContain("node.recover.start");
  });

  it("leaves a visit inside its deadline untouched", async () => {
    const { visit } = await startWork(SERVICE_STATION);

    await sweeper().sweep();
    const swept = await deps().runs.visit(visit.id);

    expect(swept!.report).toBeNull();
  });

  it("never sweeps a human visit, which has no deadline to be overdue", async () => {
    const { visit } = await startWork(HUMAN_STATION);

    await sweeper().sweep();
    const swept = await deps().runs.visit(visit.id);

    expect(swept!.report).toBeNull();
  });
});

async function unclaimedDispatchScenario(): Promise<{ visit: Visit; dispatchId: string }> {
  const { visit } = await startWork(SERVICE_STATION);
  const dispatch = (await deps().events.listByRun(visit.runId)).find((event) => event.name === "station_run.dispatch")!;

  await backdateEventCreatedAt(dispatch.id, past(31));

  return { visit, dispatchId: dispatch.id };
}

async function backdateEventCreatedAt(eventId: string, createdAt: Date): Promise<void> {
  await deps().pool.query(`update events set created_at = $1 where id = $2`, [createdAt, eventId]);
}

describe("Sweeper: unclaimed dispatches", () => {
  it("fails the visit, naming the tags no worker offered", async () => {
    const { visit } = await unclaimedDispatchScenario();

    await sweeper().sweep();
    const swept = await deps().runs.visit(visit.id);

    expect(swept!.report).toMatchObject({ outcome: "failed", error: expect.stringContaining("station:work") });
  });

  it("dead-letters the unclaimed dispatch event", async () => {
    const { dispatchId } = await unclaimedDispatchScenario();

    await sweeper().sweep();
    const swept = await deps().events.get(dispatchId);

    expect(swept!.deadAt).not.toBeNull();
  });

  it("leaves a claimed dispatch alone, even once it is old", async () => {
    const { visit, dispatchId } = await unclaimedDispatchScenario();

    await deps().events.claim({ names: ["station_run.dispatch"], limit: 10, claimedBy: "worker-1" });
    await sweeper().sweep();
    const sweptVisit = await deps().runs.visit(visit.id);
    const sweptEvent = await deps().events.get(dispatchId);

    expect({ report: sweptVisit!.report, deadAt: sweptEvent!.deadAt }).toEqual({ report: null, deadAt: null });
  });
});

describe("Sweeper: repeated sweeps", () => {
  it("changes nothing on a second sweep", async () => {
    await overdueVisitScenario();

    await sweeper().sweep();
    const secondSweep = await sweeper().sweep();

    expect(secondSweep).toBe(0);
  });
});
