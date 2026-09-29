import { beforeEach, describe, expect, it } from "vitest";
import { reapSettledRunEvents } from "./events-retention.js";
import { setupEventsFixture } from "./events.fixtures.js";

const { pool, store, fakeRunId } = setupEventsFixture();

const CUTOFF = new Date("2026-01-01T00:00:00Z");
const BEFORE_CUTOFF = new Date("2025-12-31T00:00:00Z");
const AFTER_CUTOFF = new Date("2026-01-02T00:00:00Z");
const A_YEAR_BEFORE_CUTOFF = new Date("2025-01-01T00:00:00Z");

beforeEach(async () => {
  await pool().query("truncate assembly_runs restart identity cascade");
});

async function runSettledAt(finishedAt: Date | null): Promise<string> {
  const { rows } = await pool().query(
    `insert into assembly_runs (id, line_id, line_hash, repo, start_items, finished_at) values (gen_random_uuid(), 'l', 'h', 'r', '{}'::jsonb, $1) returning id`,
    [finishedAt],
  );

  return rows[0].id;
}

async function namesLeft(): Promise<string[]> {
  const { rows } = await pool().query("select name from events order by id");

  return rows.map((row: { name: string }) => row.name);
}

async function reap(): Promise<number> {
  return reapSettledRunEvents(pool(), CUTOFF);
}

async function enqueueAncient(name: string, runId?: string): Promise<void> {
  await store().enqueue({ name, payload: {}, runId });
  await pool().query("update events set created_at = $1", [A_YEAR_BEFORE_CUTOFF]);
}

describe("reapSettledRunEvents", () => {
  it("deletes the events of a run that settled before the cutoff, and counts them", async () => {
    const runId = await runSettledAt(BEFORE_CUTOFF);
    await store().enqueue({ name: "node.review.start", payload: {}, runId });
    await store().enqueue({ name: "station_run.reported", payload: {}, runId });

    expect(await reap()).toBe(2);
  });

  it("leaves nothing of a settled run but its internal events", async () => {
    const runId = await runSettledAt(BEFORE_CUTOFF);
    await store().enqueue({ name: "node.review.start", payload: {}, runId });
    await store().enqueue({ name: "internal.run.started", payload: {}, runId });

    await reap();

    expect(await namesLeft()).toEqual(["internal.run.started"]);
  });

  it("keeps an internal.run.settled of a run that settled a year before the cutoff", async () => {
    const runId = await runSettledAt(A_YEAR_BEFORE_CUTOFF);
    await store().enqueue({ name: "internal.run.settled", payload: {}, runId });

    await reap();

    expect(await namesLeft()).toEqual(["internal.run.settled"]);
  });

  it("keeps an internal.cost.missing of a settled run", async () => {
    const runId = await runSettledAt(A_YEAR_BEFORE_CUTOFF);
    await store().enqueue({ name: "internal.cost.missing", payload: {}, runId });

    await reap();

    expect(await namesLeft()).toEqual(["internal.cost.missing"]);
  });

  it("keeps every event of a run that settled after the cutoff, whatever the event's own age", async () => {
    const runId = await runSettledAt(AFTER_CUTOFF);
    await enqueueAncient("node.review.start", runId);

    await reap();

    expect(await namesLeft()).toEqual(["node.review.start"]);
  });

  it("keeps an old event of a run still open", async () => {
    const runId = await runSettledAt(null);
    await enqueueAncient("node.review.start", runId);

    await reap();

    expect(await namesLeft()).toEqual(["node.review.start"]);
  });

  it("keeps an old event that belongs to no run", async () => {
    await enqueueAncient("github.pull_request.opened");

    await reap();

    expect(await namesLeft()).toEqual(["github.pull_request.opened"]);
  });

  it("keeps an event naming a run this database does not hold", async () => {
    await store().enqueue({ name: "node.review.start", payload: {}, runId: fakeRunId() });

    await reap();

    expect(await namesLeft()).toEqual(["node.review.start"]);
  });

  it("deletes only the settled run's events when another run is open", async () => {
    const settled = await runSettledAt(BEFORE_CUTOFF);
    const open = await runSettledAt(null);
    await store().enqueue({ name: "node.a.start", payload: {}, runId: settled });
    await store().enqueue({ name: "node.b.start", payload: {}, runId: open });

    await reap();

    expect(await namesLeft()).toEqual(["node.b.start"]);
  });

  it("counts nothing when there is nothing to delete", async () => {
    expect(await reap()).toBe(0);
  });
});
