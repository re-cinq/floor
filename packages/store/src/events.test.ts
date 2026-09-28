import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PgPool } from "./pg.js";
import { openTestPool } from "./test-database.js";
import { EventStore, backoffMs, type FloorEvent } from "./events.js";

const FIXED_NOW = new Date("2026-01-01T00:00:00Z");

let pool: PgPool;
let idCounter = 0;

beforeAll(async () => {
  pool = await openTestPool();
});

beforeEach(async () => {
  await pool.query("truncate events restart identity");
  idCounter = 0;
});

afterAll(async () => {
  await pool.end();
});

function store(now: () => Date = () => FIXED_NOW): EventStore {
  return new EventStore({ connection: pool, now });
}

function fakeRunId(): string {
  idCounter += 1;

  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, "0")}`;
}

describe("backoffMs", () => {
  it("doubles per attempt", () => {
    expect(backoffMs(1, 1000, 60000)).toBe(2000);
  });

  it("caps at the maximum", () => {
    expect(backoffMs(10, 1000, 60000)).toBe(60000);
  });
});

describe("EventStore.enqueue", () => {
  it("writes a row under the given name", async () => {
    const event = await store().enqueue({ name: "node.review.start", payload: { runId: "r1" } });

    expect(event.name).toBe("node.review.start");
  });

  it("writes a row with no attempts yet", async () => {
    const event = await store().enqueue({ name: "node.review.start", payload: { runId: "r1" } });

    expect(event.attempts).toBe(0);
  });

  it("returns the existing row's id on a repeated dedupe key", async () => {
    const first = await store().enqueue({ name: "assembly_run.start", payload: {}, dedupeKey: "run:r1:start" });
    const second = await store().enqueue({ name: "assembly_run.start", payload: {}, dedupeKey: "run:r1:start" });

    expect(second.id).toBe(first.id);
  });

  it("inserts only one row for a repeated dedupe key", async () => {
    await store().enqueue({ name: "assembly_run.start", payload: {}, dedupeKey: "run:r1:start" });
    await store().enqueue({ name: "assembly_run.start", payload: {}, dedupeKey: "run:r1:start" });

    const { rows } = await pool.query("select count(*) from events where dedupe_key = $1", ["run:r1:start"]);

    expect(Number(rows[0].count)).toBe(1);
  });

  it("is not claimable before its availableAt", async () => {
    const future = new Date(FIXED_NOW.getTime() + 60_000);

    await store().enqueue({ name: "schedule.nightly.tick", payload: {}, availableAt: future });
    const claimed = await store().claim({ names: ["schedule.nightly.tick"], limit: 10, claimedBy: "floor-1" });

    expect(claimed).toHaveLength(0);
  });
});

async function claimOneScenario(): Promise<FloorEvent[]> {
  await store().enqueue({ name: "node.review.start", payload: {} });

  return store().claim({ names: ["node.review.start"], limit: 10, claimedBy: "floor-1" });
}

async function concurrentClaimScenario(): Promise<[FloorEvent[], FloorEvent[]]> {
  await enqueueFiveReviewStarts();

  return Promise.all([
    store().claim({ names: ["node.review.start"], limit: 3, claimedBy: "agent-a" }),
    store().claim({ names: ["node.review.start"], limit: 3, claimedBy: "agent-b" }),
  ]);
}

async function enqueueFiveReviewStarts(): Promise<void> {
  for (let index = 0; index < 5; index++) {
    await store().enqueue({ name: "node.review.start", payload: { index } });
  }
}

async function reclaimScenario(): Promise<FloorEvent[]> {
  await store().enqueue({ name: "node.review.start", payload: {} });
  await store().claim({ names: ["node.review.start"], limit: 10, claimedBy: "dead-worker" });

  const tenMinutesLater = store(() => new Date(FIXED_NOW.getTime() + 10 * 60_000));

  return tenMinutesLater.claim({ names: ["node.review.start"], limit: 10, claimedBy: "live-worker" });
}

describe("EventStore.claim", () => {
  it("claims a due, unclaimed event by name", async () => {
    const claimed = await claimOneScenario();

    expect(claimed).toHaveLength(1);
  });

  it("records who claimed it", async () => {
    const claimed = await claimOneScenario();

    expect(claimed[0]!.claimedBy).toBe("floor-1");
  });

  it("never claims the same row twice at once, even under concurrent callers (FOR UPDATE SKIP LOCKED)", async () => {
    const [firstBatch, secondBatch] = await concurrentClaimScenario();
    const claimedIds = [...firstBatch, ...secondBatch].map((event) => event.id);

    expect(new Set(claimedIds).size).toBe(claimedIds.length);
  });

  it("claims every enqueued row across concurrent callers, none lost", async () => {
    const [firstBatch, secondBatch] = await concurrentClaimScenario();

    expect(firstBatch.length + secondBatch.length).toBe(5);
  });

  it("filters by name, leaving events of another name unclaimed", async () => {
    await store().enqueue({ name: "station_run.reported", payload: {} });

    const claimed = await store().claim({ names: ["node.review.start"], limit: 10, claimedBy: "floor-1" });

    expect(claimed).toHaveLength(0);
  });

  async function tagFilteredClaim(offeredTags: string[]): Promise<FloorEvent[]> {
    await store().enqueue({ name: "station_run.dispatch", payload: {}, tags: ["kind:agent", "cluster:acme"] });

    return store().claim({ names: ["station_run.dispatch"], tags: offeredTags, limit: 10, claimedBy: "agent-1" });
  }

  it("refuses a dispatch whose tags the caller only partly offers", async () => {
    const claimed = await tagFilteredClaim(["kind:agent"]);

    expect(claimed).toHaveLength(0);
  });

  it("claims a dispatch whose tags the caller fully offers", async () => {
    const claimed = await tagFilteredClaim(["kind:agent", "cluster:acme"]);

    expect(claimed).toHaveLength(1);
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
    const reclaimed = await reclaimScenario();

    expect(reclaimed).toHaveLength(1);
  });

  it("hands a reclaimed row to the new claimant", async () => {
    const reclaimed = await reclaimScenario();

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
    const dropped = await store().enqueue({ name: "node.c.start", payload: {}, runId: fakeRunId() });

    await store().ack(acked.id);
    await store().deadLetter(dead.id, "boom");
    await store().dropQueued(dropped.runId!);

    const claimed = await store().claim({
      names: ["node.a.start", "node.b.start", "node.c.start"],
      limit: 10,
      claimedBy: "floor-1",
    });

    expect(claimed).toHaveLength(0);
  });
});

async function concurrentClaimExceptScenario(): Promise<[FloorEvent[], FloorEvent[]]> {
  await enqueueFiveReviewStarts();

  return Promise.all([
    store().claimExcept({ excludedNames: ["station_run.dispatch", "station_run.abort"], limit: 3, claimedBy: "agent-a" }),
    store().claimExcept({ excludedNames: ["station_run.dispatch", "station_run.abort"], limit: 3, claimedBy: "agent-b" }),
  ]);
}

async function claimExceptScenario(name: string): Promise<FloorEvent[]> {
  await store().enqueue({ name, payload: {} });

  return store().claimExcept({
    excludedNames: ["station_run.dispatch", "station_run.abort"],
    limit: 10,
    claimedBy: "floor-1",
  });
}

describe("EventStore.claimExcept", () => {
  it("never returns an excluded name", async () => {
    await store().enqueue({ name: "station_run.dispatch", payload: {}, tags: ["kind:agent"] });
    await store().enqueue({ name: "station_run.abort", payload: {} });

    const claimed = await store().claimExcept({
      excludedNames: ["station_run.dispatch", "station_run.abort"],
      limit: 10,
      claimedBy: "floor-1",
    });

    expect(claimed).toHaveLength(0);
  });

  it("returns an event whose name is not excluded", async () => {
    const claimed = await claimExceptScenario("node.review.start");

    expect(claimed.map((event) => event.name)).toEqual(["node.review.start"]);
  });

  it("returns internal.run.started, another non-excluded name", async () => {
    const claimed = await claimExceptScenario("internal.run.started");

    expect(claimed.map((event) => event.name)).toEqual(["internal.run.started"]);
  });

  it("never claims the same row twice at once, even under concurrent callers (FOR UPDATE SKIP LOCKED)", async () => {
    const [firstBatch, secondBatch] = await concurrentClaimExceptScenario();
    const claimedIds = [...firstBatch, ...secondBatch].map((event) => event.id);

    expect(new Set(claimedIds).size).toBe(claimedIds.length);
  });
});

async function failedOnceScenario(): Promise<FloorEvent> {
  const event = await store().enqueue({ name: "node.review.start", payload: {} });

  await store().fail(event.id, "transient error");

  return (await store().get(event.id))!;
}

describe("EventStore.fail", () => {
  it("counts the attempt and clears the claim", async () => {
    const event = await store().enqueue({ name: "node.review.start", payload: {} });

    await store().claim({ names: ["node.review.start"], limit: 10, claimedBy: "worker-1" });
    await store().fail(event.id, "transient error");

    const after = await store().get(event.id);

    expect({ attempts: after!.attempts, claimedAt: after!.claimedAt }).toEqual({ attempts: 1, claimedAt: null });
  });

  it("records the error", async () => {
    const after = await failedOnceScenario();

    expect(after.lastError).toBe("transient error");
  });

  it("pushes availableAt into the future, with backoff", async () => {
    const after = await failedOnceScenario();

    expect(after.availableAt.getTime()).toBeGreaterThan(FIXED_NOW.getTime());
  });

  it("dead-letters after the max attempts, rather than backing off forever", async () => {
    const event = await store().enqueue({ name: "node.review.start", payload: {} });

    for (let attempt = 0; attempt < 8; attempt++) {
      await store().fail(event.id, `attempt ${attempt}`);
    }

    const after = await store().get(event.id);

    expect(after!.deadAt).not.toBeNull();
  });
});

async function deadLetteredScenario(): Promise<FloorEvent> {
  const event = await store().enqueue({ name: "totally.unknown.event", payload: {} });

  await store().deadLetter(event.id, "no handler for this name");

  return (await store().get(event.id))!;
}

describe("EventStore.deadLetter", () => {
  it("marks the event dead", async () => {
    const after = await deadLetteredScenario();

    expect(after.deadAt).not.toBeNull();
  });

  it("spends exactly one attempt", async () => {
    const after = await deadLetteredScenario();

    expect(after.attempts).toBe(1);
  });
});

describe("EventStore.dropQueued", () => {
  it("drops an unclaimed event of the run", async () => {
    const runId = fakeRunId();

    await store().enqueue({ name: "node.review.start", payload: {}, runId });
    await store().dropQueued(runId);

    const claimed = await store().claim({ names: ["node.review.start"], limit: 10, claimedBy: "floor-1" });

    expect(claimed).toHaveLength(0);
  });

  it("leaves an already-claimed event alone, for its worker to fail or ack", async () => {
    const runId = fakeRunId();

    await store().enqueue({ name: "node.review.start", payload: {}, runId });
    await store().claim({ names: ["node.review.start"], limit: 10, claimedBy: "worker-1" });
    await store().dropQueued(runId);

    const result = await pool.query("select dropped_at from events where run_id = $1", [runId]);
    const row = result.rows[0];

    expect(row.dropped_at).toBeNull();
  });

  it("never touches an event of another run", async () => {
    const runId = fakeRunId();
    const otherRunId = fakeRunId();

    await store().enqueue({ name: "node.a.start", payload: {}, runId });
    await store().enqueue({ name: "node.b.start", payload: {}, runId: otherRunId });
    await store().dropQueued(runId);

    const claimed = await store().claim({
      names: ["node.a.start", "node.b.start"],
      limit: 10,
      claimedBy: "floor-1",
    });

    expect(claimed.map((event) => event.name)).toEqual(["node.b.start"]);
  });
});

describe("EventStore.listByRun", () => {
  it("returns a run's events in order, the reconstruction feed for one run", async () => {
    const runId = fakeRunId();

    await store().enqueue({ name: "node.review.start", payload: {}, runId });
    await store().enqueue({ name: "station_run.reported", payload: {}, runId });
    await store().enqueue({ name: "node.done.start", payload: {}, runId });

    const events = await store().listByRun(runId);

    expect(events.map((event) => event.name)).toEqual([
      "node.review.start",
      "station_run.reported",
      "node.done.start",
    ]);
  });
});
