import { describe, expect, it } from "vitest";
import { OutsideEvents, type FloorEvent, type LineBody, type ScheduleBody } from "@floor/store";
import { setupTestServer } from "../test-server.js";
import { MARKER_LINE } from "./lines.fixtures.js";
import { MISSING_RUN, MISSING_VISIT, NEEDY_STATION, WORK_LINE, DispatcherScene } from "./dispatcher.fixtures.js";

const { deps } = setupTestServer();
const { tickUntilIdle, dispatcher, startLine, workOpened, postedThenHandled } = new DispatcherScene(deps);

describe("Dispatcher: the walk", () => {
  it("walks a line of markers to its exit with nobody reporting", async () => {
    const runId = await startLine(MARKER_LINE);

    await tickUntilIdle();
    const run = await deps().runs.get(runId);

    expect(run!.outcome).toBe("success");
  });

  it("opens the entry node's visit from the run's start event", async () => {
    const { visits } = await workOpened();

    expect(visits.map((visit) => `${visit.nodeId}#${visit.iteration}`)).toEqual(["work#1"]);
  });

  it("acks the events it handles", async () => {
    const { runEvents } = await workOpened();
    const entryStart = runEvents.find((event) => event.name === "node.work.start");

    expect(entryStart!.ackedAt).not.toBeNull();
  });

  it("leaves station_run.dispatch for a worker to claim", async () => {
    const { runEvents } = await workOpened();
    const dispatch = runEvents.find((event) => event.name === "station_run.dispatch");

    expect(dispatch).toMatchObject({ claimedAt: null, tags: ["station:work"] });
  });

  it("settles the run once the station's report arrives as an event", async () => {
    const { runId, visits } = await workOpened();

    await postedThenHandled("station_run.reported", { visitId: visits[0]!.id, report: { outcome: "success" } });
    const run = await deps().runs.get(runId);

    expect(run!.outcome).toBe("success");
  });
});


describe("Dispatcher: events it cannot act on", () => {
  it("fails the run when its node can never open", async () => {
    const runId = await startLine(WORK_LINE, NEEDY_STATION);

    await tickUntilIdle();
    const run = await deps().runs.get(runId);

    expect(run).toMatchObject({ outcome: "error", reason: expect.stringContaining("missing required need") });
  });

  it("dead-letters the start event of a node that can never open", async () => {
    const runId = await startLine(WORK_LINE, NEEDY_STATION);

    await tickUntilIdle();
    const runEvents = await deps().events.listByRun(runId);
    const entryStart = runEvents.find((event) => event.name === "node.work.start");

    expect(entryStart!.deadAt).not.toBeNull();
  });

  it("dead-letters an event for a run that does not exist", async () => {
    const handled = await postedThenHandled("node.work.start", { runId: MISSING_RUN, iteration: 1 });

    expect(handled.deadAt).not.toBeNull();
  });

  it("dead-letters a report for a visit that does not exist", async () => {
    const handled = await postedThenHandled("station_run.reported", { visitId: MISSING_VISIT, report: { outcome: "success" } });

    expect(handled.deadAt).not.toBeNull();
  });

  it("dead-letters a report with no outcome, naming what is wrong", async () => {
    const handled = await postedThenHandled("station_run.reported", { visitId: MISSING_VISIT, report: {} });

    expect(handled.lastError).toContain("report.outcome");
  });

  it("acks an event that starts no node in the run it names", async () => {
    const { runId } = await workOpened();

    const handled = await postedThenHandled("github.pull_request.closed", { runId });

    expect(handled.ackedAt).not.toBeNull();
  });

  it("dead-letters the walk's start of a node in a run already ended, leaving its outcome alone", async () => {
    const { runId } = await workOpened();

    await deps().runs.cancel(runId, "not needed");
    const handled = await postedThenHandled("node.work.start", { runId, iteration: 2 });
    const run = await deps().runs.get(runId);

    expect({ dead: handled.deadAt !== null, outcome: run!.outcome }).toEqual({ dead: true, outcome: "cancelled" });
  });
});


describe("Dispatcher: events from outside", () => {
  const OPENED = "github.pull_request.opened";
  const CLOSED = "github.pull_request.closed";
  const REPO = "github.com/re-cinq/lore";

  const WAITS_FOR_MERGE = { id: "merged", station: "pr-merged", reports: [{ on: CLOSED, when: { merged: true }, outcome: "success" }] };

  const MERGE_LINE: LineBody = {
    entry: "merged",
    exit: "done",
    start: { on: [OPENED], args: { pr_url: "{pull_request_url}" } },
    args: { pr_url: { kind: "value", subject: true } },
    nodes: [WAITS_FOR_MERGE, { id: "done" }],
    edges: [{ from: "merged", to: "done", on: "success" }],
  };

  const NOTIFY_LINE: LineBody = {
    ...MARKER_LINE,
    start: { on: ["internal.run.settled"], args: { settled_run: "{runId}" } },
    args: { settled_run: { kind: "value" } },
  };

  async function pullRequestOpened() {
    await deps().definitions.put("line", "merge", MERGE_LINE);
    await deps().definitions.put("station", "pr-merged", { kind: "human", outcomes: ["success"], needs: [], produces: [] });
    await postedThenHandled(OPENED, { repo: REPO, pull_request_url: "https://pr/412" });

    return deps().runs.list({ lineId: "merge" }, { limit: 10 });
  }

  async function pullRequestMerged() {
    await deps().definitions.put("line", "notify", NOTIFY_LINE);
    await pullRequestOpened();
    await postedThenHandled(CLOSED, { subjectKey: "pr_url:https://pr/412", repo: REPO, merged: true });

    return deps().runs.list({ repo: REPO }, { limit: 10 });
  }

  it("starts the line that declares the event", async () => {
    const runs = await pullRequestOpened();

    expect(runs.items).toMatchObject([{ lineId: "merge", subjectKey: "pr_url:https://pr/412", outcome: null }]);
  });

  it("opens the started run's entry node in the same pass over the queue", async () => {
    const runs = await pullRequestOpened();
    const [merge] = runs.items;
    const visits = await deps().runs.visits(merge!.id);

    expect(visits).toMatchObject([{ nodeId: "merged", report: null }]);
  });

  it("answers the waiting node, found by the run's subject, and the run settles", async () => {
    const runs = await pullRequestMerged();
    const merge = runs.items.find((run) => run.lineId === "merge");

    expect(merge!.outcome).toBe("success");
  });

  it("starts a line on another's settling, and walks it to its end", async () => {
    const runs = await pullRequestMerged();
    const notify = runs.items.find((run) => run.lineId === "notify");

    expect(notify).toMatchObject({ outcome: "success", startItems: { settled_run: { kind: "value" } } });
  });

  it("starts the notify line once, not again on its own settling", async () => {
    const runs = await pullRequestMerged();

    expect(runs.items.filter((run) => run.lineId === "notify")).toHaveLength(1);
  });

  it("acks an event naming a subject no open run holds", async () => {
    const handled = await postedThenHandled(CLOSED, { subjectKey: "pr_url:https://pr/999", repo: REPO, merged: true });

    expect(handled.ackedAt).not.toBeNull();
  });

  it("dead-letters an event whose payload cannot fill a line's start mapping", async () => {
    await deps().definitions.put("line", "merge", MERGE_LINE);

    const handled = await postedThenHandled(OPENED, { repo: REPO });

    expect(handled.lastError).toContain('line "merge"');
  });
});

describe("Dispatcher: schedule ticks", () => {
  const SCHEDULE_BODY: ScheduleBody = { cron: "0 0 * * *", payload: { repo: "r" } };

  const TICK_LINE: LineBody = {
    ...MARKER_LINE,
    start: { on: ["schedule.nightly.tick"], args: {} },
  };

  it("starts a line declaring start.on: schedule.<name>.tick when the tick is handled", async () => {
    await deps().definitions.put("line", "on-nightly", TICK_LINE);
    await deps().schedules.put("nightly", SCHEDULE_BODY);
    await deps().schedules.trigger("nightly");

    await tickUntilIdle();
    const runs = await deps().runs.list({ lineId: "on-nightly" }, { limit: 10 });

    expect(runs.items).toHaveLength(1);
  });

  it("enqueues no further tick for a schedule archived before an in-flight tick of its is handled", async () => {
    await deps().schedules.put("nightly", SCHEDULE_BODY);
    const pending = (await deps().schedules.pending("nightly"))!;
    const inFlightAt = new Date(pending.availableAt.getTime() + 1000);

    await deps().definitions.archive("schedule", "nightly");
    await deps().events.enqueue({
      name: "schedule.nightly.tick",
      payload: { scheduledFor: inFlightAt.toISOString() },
      availableAt: deps().now(),
      dedupeKey: "schedule:nightly:in-flight",
    });

    await tickUntilIdle();
    const { rows } = await deps().pool.query(
      "select count(*) from events where name = 'schedule.nightly.tick' and acked_at is null",
    );

    expect(Number(rows[0].count)).toBe(1);
  });

  const UNFILLABLE_LINE: LineBody = {
    ...TICK_LINE,
    args: { topic: { kind: "value" } },
    start: { on: ["schedule.nightly.tick"], args: { topic: "{topic}" } },
  };

  class LinesOutOfReach extends OutsideEvents {
    override startLines(): Promise<never> {
      return Promise.reject(new Error("the database is out of reach"));
    }
  }

  async function refusedTick(): Promise<FloorEvent> {
    await deps().definitions.put("line", "on-nightly", UNFILLABLE_LINE);
    await deps().definitions.put("schedule", "nightly", SCHEDULE_BODY);
    const tick = (await deps().schedules.trigger("nightly"))!;

    await tickUntilIdle();

    return (await deps().events.get(tick.id))!;
  }

  it("leaves the next occurrence pending when the tick is refused for a start mapping its payload cannot fill", async () => {
    await refusedTick();
    const next = await deps().schedules.pending("nightly");

    expect(next?.payload).toEqual({ repo: "r", scheduledFor: "2026-01-02T00:00:00.000Z" });
  });

  it("dead-letters the refused tick, naming the line and the field its payload lacks", async () => {
    const tick = await refusedTick();

    expect(tick).toMatchObject({ deadAt: deps().now(), lastError: 'line "on-nightly": a template names {topic}, which is not there to fill it' });
  });

  it("enqueues the next occurrence once when a tick that failed is handled a second time", async () => {
    await deps().definitions.put("schedule", "nightly", SCHEDULE_BODY);
    const tick = (await deps().schedules.trigger("nightly"))!;
    const failing = dispatcher(new LinesOutOfReach({ pool: deps().pool, runs: deps().runs, definitions: deps().definitions }));

    await failing.tick();
    await deps().pool.query("update events set not_before = $1 where id = $2", [deps().now(), tick.id]);
    await failing.tick();
    const { rows } = await deps().pool.query(
      "select attempts, payload->>'scheduledFor' as occurrence from events where name = 'schedule.nightly.tick' order by id",
    );

    expect(rows).toEqual([
      { attempts: 2, occurrence: "2026-01-01T00:00:00.000Z" },
      { attempts: 0, occurrence: "2026-01-02T00:00:00.000Z" },
    ]);
  });
});
