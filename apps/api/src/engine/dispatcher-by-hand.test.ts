import { describe, expect, it } from "vitest";
import type { LineBody } from "@floor/store";
import { setupTestServer } from "../test-server.js";
import { WORK_LINE, DispatcherScene } from "./dispatcher.fixtures.js";

const { deps } = setupTestServer();
const { defineLine, workOpened, postedThenHandled } = new DispatcherScene(deps);

describe("Dispatcher: a start by hand", () => {
  async function checkedByHand() {
    const { runId } = await workOpened();
    const handled = await postedThenHandled("manual.work.check", { runId, requestedBy: "ana" });
    const visits = await deps().runs.visits(runId);

    return { handled, visits };
  }

  it("opens the node the event names in that run's line", async () => {
    const { visits } = await checkedByHand();

    expect(visits.at(-1)).toMatchObject({ nodeId: "check", iteration: 1, requestedBy: "ana" });
  });

  it("acks the start event", async () => {
    const { handled } = await checkedByHand();

    expect(handled.ackedAt).not.toBeNull();
  });
});

describe("Dispatcher: a start by hand on a run already ended", () => {
  const TICKET_LINE: LineBody = { ...WORK_LINE, args: { ticket: { kind: "value", subject: true } } };
  const TICKET = { ticket: { kind: "value", ref: "42", by: "start" } } as const;

  async function workStartedByAnaAfterCancel() {
    const { runId } = await workOpened();

    await deps().runs.cancel(runId, "not needed");
    const handled = await postedThenHandled("node.work.start", { runId, requestedBy: "ana" });

    return { runId, handled };
  }

  async function cancelledBesideAnOpenRun(): Promise<string> {
    await defineLine(TICKET_LINE);
    const { run } = await deps().runs.start({ lineId: "line", repo: "r", startItems: TICKET });

    await deps().runs.cancel(run.id, "not needed");
    await deps().runs.start({ lineId: "line", repo: "r", startItems: TICKET });

    return run.id;
  }

  it("reopens the run and opens work 2 for ana", async () => {
    const { runId } = await workStartedByAnaAfterCancel();
    const run = await deps().runs.get(runId);
    const visits = await deps().runs.visits(runId);

    expect({ finishedAt: run!.finishedAt, opened: visits.at(-1) }).toMatchObject({ finishedAt: null, opened: { nodeId: "work", iteration: 2, requestedBy: "ana" } });
  });

  it("settles the reopened run as success once work 2 reports", async () => {
    const { runId } = await workStartedByAnaAfterCancel();
    const reopenedWork = (await deps().runs.visits(runId)).at(-1)!;

    await postedThenHandled("station_run.reported", { visitId: reopenedWork.id, report: { outcome: "success" } });
    const run = await deps().runs.get(runId);

    expect(run!.outcome).toBe("success");
  });

  it("dead-letters a start by hand on a run whose ticket another open run holds, leaving it cancelled", async () => {
    const runId = await cancelledBesideAnOpenRun();

    const handled = await postedThenHandled("node.work.start", { runId, requestedBy: "ana" });
    const run = await deps().runs.get(runId);

    expect({ error: handled.deadAt && handled.lastError, outcome: run!.outcome }).toEqual({
      error: expect.stringContaining("is open on its subject \"ticket:42\""),
      outcome: "cancelled",
    });
  });
});
