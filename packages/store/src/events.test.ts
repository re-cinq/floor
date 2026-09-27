// Real Postgres, not a fake — a queue's correctness lives in the SQL, and
// `FOR UPDATE SKIP LOCKED` has no meaningful in-memory stand-in. Needs
// `FLOOR_DATABASE_URL`; see README.md for the one-line docker command.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, migrate, type PgPool } from "./pg.js";
import { EventStore, backoffMs } from "./events.js";

const connectionString =
  process.env.FLOOR_DATABASE_URL ?? "postgres://postgres:floor@localhost:5433/floor";

let pool: PgPool;

beforeAll(async () => {
  pool = createPool(connectionString);
  await migrate(pool);
});

beforeEach(async () => {
  await pool.query("truncate events restart identity");
});

afterAll(async () => {
  await pool.end();
});

function store(): EventStore {
  return new EventStore({ db: pool });
}

describe("backoffMs", () => {
  it("doubles per attempt and caps at the maximum", () => {
    expect(backoffMs(0, 1000, 60000)).toBe(1000);
    expect(backoffMs(1, 1000, 60000)).toBe(2000);
    expect(backoffMs(2, 1000, 60000)).toBe(4000);
    expect(backoffMs(10, 1000, 60000)).toBe(60000);
  });
});

describe("EventStore.enqueue", () => {
  it("writes a claimable row", async () => {
    const event = await store().enqueue({ name: "node.review.start", payload: { runId: "r1" } });

    expect(event.name).toBe("node.review.start");
    expect(event.ackedAt).toBeNull();
    expect(event.attempts).toBe(0);
  });

  it("returns the existing row on a repeated dedupe key, rather than inserting a second one", async () => {
    const first = await store().enqueue({ name: "assembly_run.start", payload: {}, dedupeKey: "run:r1:start" });
    const second = await store().enqueue({ name: "assembly_run.start", payload: {}, dedupeKey: "run:r1:start" });

    expect(second.id).toBe(first.id);
    const { rows } = await pool.query("select count(*) from events where dedupe_key = $1", ["run:r1:start"]);

    expect(Number(rows[0].count)).toBe(1);
  });

  it("is not claimable before its not_before", async () => {
    const future = new Date(Date.now() + 60_000);

    await store().enqueue({ name: "schedule.nightly.tick", payload: {}, notBefore: future });
    const claimed = await store().claim({ names: ["schedule.nightly.tick"], limit: 10, claimedBy: "floor-1" });

    expect(claimed).toHaveLength(0);
  });
});

describe("EventStore.claim", () => {
  it("claims a due, unclaimed event by name", async () => {
    await store().enqueue({ name: "node.review.start", payload: { x: 1 } });

    const claimed = await store().claim({ names: ["node.review.start"], limit: 10, claimedBy: "floor-1" });

    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.claimedBy).toBe("floor-1");
  });

  it("never claims the same row twice at once, even under concurrent callers (FOR UPDATE SKIP LOCKED)", async () => {
    for (let i = 0; i < 5; i++) {
      await store().enqueue({ name: "node.review.start", payload: { i } });
    }

    const [a, b] = await Promise.all([
      store().claim({ names: ["node.review.start"], limit: 3, claimedBy: "agent-a" }),
      store().claim({ names: ["node.review.start"], limit: 3, claimedBy: "agent-b" }),
    ]);
    const ids = [...a, ...b].map((e) => e.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(a.length + b.length).toBe(5);
  });

  it("filters by name, leaving events of another name unclaimed", async () => {
    await store().enqueue({ name: "station_run.reported", payload: {} });

    expect(await store().claim({ names: ["node.review.start"], limit: 10, claimedBy: "floor-1" })).toHaveLength(0);
  });

  it("only claims a dispatch whose tags the caller fully offers", async () => {
    await store().enqueue({ name: "station_run.dispatch", payload: {}, tags: ["kind:agent", "cluster:acme"] });

    const withoutTag = await store().claim({
      names: ["station_run.dispatch"],
      tags: ["kind:agent"],
      limit: 10,
      claimedBy: "agent-1",
    });
    const withBothTags = await store().claim({
      names: ["station_run.dispatch"],
      tags: ["kind:agent", "cluster:acme"],
      limit: 10,
      claimedBy: "agent-1",
    });

    expect(withoutTag).toHaveLength(0);
    expect(withBothTags).toHaveLength(1);
  });

  it("claims an untagged event for any caller, tag filter or not", async () => {
    await store().enqueue({ name: "station_run.dispatch", payload: {} });

    const claimed = await store().claim({
      names: ["station_run.dispatch"],
      tags: ["kind:agent"],
      limit: 10,
      claimedBy: "agent-1",
    });

    expect(claimed).toHaveLength(1);
  });

  it("reclaims a stale claim, which is what survives a crashed worker", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const staleStore = new EventStore({ db: pool, now: () => now });

    await staleStore.enqueue({ name: "node.review.start", payload: {} });
    await staleStore.claim({ names: ["node.review.start"], limit: 10, claimedBy: "dead-worker" });

    const tenMinutesLater = new EventStore({
      db: pool,
      now: () => new Date(now.getTime() + 10 * 60_000),
    });

    const reclaimed = await tenMinutesLater.claim({
      names: ["node.review.start"],
      limit: 10,
      claimedBy: "live-worker",
    });

    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]!.claimedBy).toBe("live-worker");
  });

  it("does not reclaim a fresh claim", async () => {
    await store().enqueue({ name: "node.review.start", payload: {} });
    await store().claim({ names: ["node.review.start"], limit: 10, claimedBy: "worker-1" });

    const second = await store().claim({ names: ["node.review.start"], limit: 10, claimedBy: "worker-2" });

    expect(second).toHaveLength(0);
  });

  it("never claims an acked, dead, or dropped event", async () => {
    const acked = await store().enqueue({ name: "node.a.start", payload: {} });
    const dead = await store().enqueue({ name: "node.b.start", payload: {} });
    const dropped = await store().enqueue({ name: "node.c.start", payload: {}, runId: crypto.randomUUID() });

    await store().ack(acked.id);
    await store().fail(dead.id, "boom", true);
    await store().dropQueued(dropped.runId!);

    const claimed = await store().claim({
      names: ["node.a.start", "node.b.start", "node.c.start"],
      limit: 10,
      claimedBy: "floor-1",
    });

    expect(claimed).toHaveLength(0);
  });
});

describe("EventStore.fail", () => {
  it("pushes not_before out with exponential backoff and clears the claim", async () => {
    const event = await store().enqueue({ name: "node.review.start", payload: {} });

    await store().claim({ names: ["node.review.start"], limit: 10, claimedBy: "worker-1" });
    await store().fail(event.id, "transient error");

    const after = await store().get(event.id);

    expect(after!.attempts).toBe(1);
    expect(after!.claimedAt).toBeNull();
    expect(after!.lastError).toBe("transient error");
    expect(after!.notBefore.getTime()).toBeGreaterThan(Date.now());
  });

  it("dead-letters after the max attempts, rather than backing off forever", async () => {
    const event = await store().enqueue({ name: "node.review.start", payload: {} });

    for (let i = 0; i < 8; i++) {
      await store().fail(event.id, `attempt ${i}`);
    }

    const after = await store().get(event.id);

    expect(after!.deadAt).not.toBeNull();
  });

  it("dead-letters immediately when told the failure is permanent, without spending any attempts on retry", async () => {
    const event = await store().enqueue({ name: "totally.unknown.event", payload: {} });

    await store().fail(event.id, "no handler for this name", true);

    const after = await store().get(event.id);

    expect(after!.deadAt).not.toBeNull();
    expect(after!.attempts).toBe(1);
  });
});

describe("EventStore.dropQueued", () => {
  it("drops an unclaimed event of the run", async () => {
    const runId = crypto.randomUUID();

    await store().enqueue({ name: "node.review.start", payload: {}, runId });
    await store().dropQueued(runId);

    const claimed = await store().claim({ names: ["node.review.start"], limit: 10, claimedBy: "floor-1" });

    expect(claimed).toHaveLength(0);
  });

  it("leaves an already-claimed event alone, for its worker to fail or ack", async () => {
    const runId = crypto.randomUUID();

    await store().enqueue({ name: "node.review.start", payload: {}, runId });
    await store().claim({ names: ["node.review.start"], limit: 10, claimedBy: "worker-1" });
    await store().dropQueued(runId);

    const event = await pool.query("select dropped_at from events where run_id = $1", [runId]);

    expect(event.rows[0].dropped_at).toBeNull();
  });

  it("never touches an event of another run", async () => {
    const runId = crypto.randomUUID();
    const otherRunId = crypto.randomUUID();

    await store().enqueue({ name: "node.a.start", payload: {}, runId });
    await store().enqueue({ name: "node.b.start", payload: {}, runId: otherRunId });
    await store().dropQueued(runId);

    const claimed = await store().claim({
      names: ["node.a.start", "node.b.start"],
      limit: 10,
      claimedBy: "floor-1",
    });

    expect(claimed.map((e) => e.name)).toEqual(["node.b.start"]);
  });
});

describe("EventStore.listByRun", () => {
  it("returns a run's events in order, the reconstruction feed for one run", async () => {
    const runId = crypto.randomUUID();

    await store().enqueue({ name: "node.review.start", payload: {}, runId });
    await store().enqueue({ name: "station_run.reported", payload: {}, runId });
    await store().enqueue({ name: "node.done.start", payload: {}, runId });

    const events = await store().listByRun(runId);

    expect(events.map((e) => e.name)).toEqual([
      "node.review.start",
      "station_run.reported",
      "node.done.start",
    ]);
  });
});
