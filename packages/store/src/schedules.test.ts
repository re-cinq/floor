import { beforeEach, describe, expect, it } from "vitest";
import { DefinitionsStore } from "./definitions.js";
import { EventStore } from "./events.js";
import { setupTestPool } from "./pg-test-pool.js";
import { SchedulesStore, isValidCron, isValidTimezone } from "./schedules.js";
import type { ScheduleBody } from "./types.js";

const pool = setupTestPool();
const FIXED_NOW = new Date("2026-01-01T00:00:00Z");
const SCHEDULE_BODY: ScheduleBody = { cron: "0 0 * * *", payload: { greeting: "hi" } };
const NEXT_OCCURRENCE = new Date("2026-01-02T00:00:00Z");

beforeEach(async () => {
  await pool().query("truncate definitions, events restart identity");
});

function schedules(now: () => Date = () => FIXED_NOW): SchedulesStore {
  return new SchedulesStore({
    definitions: new DefinitionsStore({ connection: pool() }),
    events: new EventStore({ connection: pool(), now }),
    now,
  });
}

async function unresolvedCount(name: string): Promise<number> {
  const { rows } = await pool().query(
    "select count(*) from events where name = $1 and acked_at is null and dead_at is null and dropped_at is null",
    [name],
  );

  return Number(rows[0].count);
}

describe("SchedulesStore.put", () => {
  it("enqueues a pending event at the next occurrence", async () => {
    await schedules().put("nightly", SCHEDULE_BODY);

    const pending = await schedules().pending("nightly");

    expect(pending?.availableAt).toEqual(NEXT_OCCURRENCE);
  });

  it("leaves exactly one pending event when put again", async () => {
    await schedules().put("nightly", SCHEDULE_BODY);
    await schedules().put("nightly", { ...SCHEDULE_BODY, cron: "0 6 * * *" });

    expect(await unresolvedCount("schedule.nightly.tick")).toBe(1);
  });

  it("leaves a pending event with the new payload when put again with the same cron", async () => {
    await schedules().put("nightly", SCHEDULE_BODY);
    await schedules().put("nightly", { ...SCHEDULE_BODY, payload: { greeting: "bye" } });

    expect(await schedules().pending("nightly")).toMatchObject({
      availableAt: NEXT_OCCURRENCE,
      payload: { greeting: "bye" },
    });
  });

  it("replaces the pending event's id when put again", async () => {
    await schedules().put("nightly", SCHEDULE_BODY);
    const before = (await schedules().pending("nightly"))!;

    await schedules().put("nightly", { ...SCHEDULE_BODY, cron: "0 6 * * *" });
    const after = (await schedules().pending("nightly"))!;

    expect(after.id).not.toBe(before.id);
  });

  it("leaves the pending event untouched when put again with an identical body", async () => {
    await schedules().put("nightly", SCHEDULE_BODY);
    const before = (await schedules().pending("nightly"))!;

    await schedules().put("nightly", { ...SCHEDULE_BODY });
    const after = (await schedules().pending("nightly"))!;

    expect(after.id).toBe(before.id);
  });

  it("returns created:false when put again with an identical body", async () => {
    await schedules().put("nightly", SCHEDULE_BODY);

    const result = await schedules().put("nightly", { ...SCHEDULE_BODY });

    expect(result.created).toBe(false);
  });

  it("computes the occurrence in the schedule's own timezone, not UTC", async () => {
    await schedules().put("nightly", { ...SCHEDULE_BODY, timezone: "Europe/Berlin" });

    const pending = await schedules().pending("nightly");

    expect(pending?.availableAt).toEqual(new Date("2026-01-01T23:00:00Z"));
  });
});

describe("SchedulesStore.enqueueNext", () => {
  it("is safe to call twice: still exactly one row for the occurrence", async () => {
    await schedules().put("nightly", SCHEDULE_BODY);
    const pending = (await schedules().pending("nightly"))!;

    await schedules().enqueueNext("nightly", pending.availableAt);
    await schedules().enqueueNext("nightly", pending.availableAt);

    const { rows } = await pool().query("select count(*) from events where dedupe_key = $1", [
      `schedule:nightly:${pending.availableAt.toISOString()}`,
    ]);

    expect(Number(rows[0].count)).toBe(1);
  });

  it("leaves exactly one unacked tick, at the following occurrence, once the current one is acked", async () => {
    await schedules().put("nightly", SCHEDULE_BODY);
    const first = (await schedules().pending("nightly"))!;

    await pool().query("update events set acked_at = now() where id = $1", [first.id]);
    await schedules().enqueueNext("nightly", first.availableAt);

    expect(await unresolvedCount("schedule.nightly.tick")).toBe(1);
  });

  it("returns null once the schedule is archived", async () => {
    await schedules().put("nightly", SCHEDULE_BODY);
    await schedules().remove("nightly");

    expect(await schedules().enqueueNext("nightly", FIXED_NOW)).toBeNull();
  });
});

describe("SchedulesStore.remove", () => {
  it("leaves no pending event", async () => {
    await schedules().put("nightly", SCHEDULE_BODY);
    await schedules().remove("nightly");

    expect(await schedules().pending("nightly")).toBeNull();
  });

  it("is pending again at the same occurrence when put back with the body it was removed with", async () => {
    await schedules().put("nightly", SCHEDULE_BODY);
    await schedules().remove("nightly");
    await schedules().put("nightly", SCHEDULE_BODY);

    expect(await schedules().pending("nightly")).toMatchObject({ availableAt: NEXT_OCCURRENCE });
  });
});

describe("SchedulesStore.trigger", () => {
  it("does not move the pending event", async () => {
    await schedules().put("nightly", SCHEDULE_BODY);
    const before = (await schedules().pending("nightly"))!;

    await schedules().trigger("nightly");
    const after = (await schedules().pending("nightly"))!;

    expect(after.id).toBe(before.id);
  });

  it("adds one extra, unresolved event for the name", async () => {
    await schedules().put("nightly", SCHEDULE_BODY);
    await schedules().trigger("nightly");

    expect(await unresolvedCount("schedule.nightly.tick")).toBe(2);
  });

  it("returns null for a schedule that was never put", async () => {
    expect(await schedules().trigger("missing")).toBeNull();
  });
});

describe("isValidCron", () => {
  it("accepts a well-formed expression", () => {
    expect(isValidCron("0 0 * * *")).toBe(true);
  });

  it("rejects a malformed expression", () => {
    expect(isValidCron("not a cron")).toBe(false);
  });
});

describe("isValidTimezone", () => {
  it("accepts a known IANA zone", () => {
    expect(isValidTimezone("Europe/Berlin")).toBe(true);
  });

  it("rejects an unknown zone", () => {
    expect(isValidTimezone("Not/AZone")).toBe(false);
  });
});
