import { beforeEach, describe, expect, it } from "vitest";
import { RecordsStore, MAX_RECORD_BODY_BYTES } from "./records.js";
import { setupTestPool } from "./pg-test-pool.js";

const pool = setupTestPool();

const VISIT_A = "00000000-0000-4000-8000-00000000000a";
const VISIT_B = "00000000-0000-4000-8000-00000000000b";
const FIXED_AT = new Date("2026-01-01T00:00:00Z");

beforeEach(async () => {
  await pool().query("truncate station_run_records");
});

function store(): RecordsStore {
  return new RecordsStore({ pool: pool() });
}

describe("RecordsStore.append", () => {
  it("starts seq at 1", async () => {
    const [record] = await store().append(VISIT_A, [{ kind: "log", body: { line: "hello" }, occurredAt: FIXED_AT }]);

    expect(record!.seq).toBe(1);
  });

  it("keeps seq per kind, not shared across kinds", async () => {
    const appended = await store().append(VISIT_A, [
      { kind: "log", body: { line: "one" }, occurredAt: FIXED_AT },
      { kind: "turn", body: { role: "user" }, occurredAt: FIXED_AT },
      { kind: "log", body: { line: "two" }, occurredAt: FIXED_AT },
    ]);

    const seqByKind = appended.map((record) => `${record.kind}:${record.seq}`).sort();

    expect(seqByKind).toEqual(["log:1", "log:2", "turn:1"]);
  });

  it("keeps seq per visit, not shared across visits", async () => {
    await store().append(VISIT_A, [{ kind: "log", body: {}, occurredAt: FIXED_AT }]);

    const [record] = await store().append(VISIT_B, [{ kind: "log", body: {}, occurredAt: FIXED_AT }]);

    expect(record!.seq).toBe(1);
  });

  it("continues from the highest seq already written", async () => {
    await store().append(VISIT_A, [{ kind: "log", body: {}, occurredAt: FIXED_AT }]);

    const [record] = await store().append(VISIT_A, [{ kind: "log", body: {}, occurredAt: FIXED_AT }]);

    expect(record!.seq).toBe(2);
  });

  it("never collides on seq under concurrent appends to the same visit and kind", async () => {
    const [first, second] = await Promise.all([
      store().append(VISIT_A, [{ kind: "log", body: { attempt: 1 }, occurredAt: FIXED_AT }]),
      store().append(VISIT_A, [{ kind: "log", body: { attempt: 2 }, occurredAt: FIXED_AT }]),
    ]);

    expect(new Set([first[0]!.seq, second[0]!.seq]).size).toBe(2);
  });

  it("refuses a body over the 64 KB cap", async () => {
    const oversized = { text: "x".repeat(MAX_RECORD_BODY_BYTES + 1) };

    await expect(store().append(VISIT_A, [{ kind: "log", body: oversized, occurredAt: FIXED_AT }])).rejects.toThrow(/exceeds the/);
  });

  it("writes nothing of a batch that fails size on any one record", async () => {
    const oversized = { text: "x".repeat(MAX_RECORD_BODY_BYTES + 1) };

    await store().append(VISIT_A, [{ kind: "log", body: { line: "kept?" }, occurredAt: FIXED_AT }, { kind: "log", body: oversized, occurredAt: FIXED_AT }]).catch(() => {});
    const page = await store().list(VISIT_A, "log", { limit: 10 });

    expect(page.items).toHaveLength(0);
  });
});

describe("RecordsStore.list", () => {
  async function fiveLogsFor(visitId: string): Promise<void> {
    for (let index = 1; index <= 5; index++) {
      await store().append(visitId, [{ kind: "log", body: { index }, occurredAt: FIXED_AT }]);
    }
  }

  it("orders by seq", async () => {
    await fiveLogsFor(VISIT_A);

    const page = await store().list(VISIT_A, "log", { limit: 10 });

    expect(page.items.map((record) => record.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it("pages forward with after and a full page's nextCursor", async () => {
    await fiveLogsFor(VISIT_A);

    const firstPage = await store().list(VISIT_A, "log", { limit: 2 });
    const secondPage = await store().list(VISIT_A, "log", { after: firstPage.nextCursor!, limit: 2 });

    expect({ first: firstPage.items.map((record) => record.seq), second: secondPage.items.map((record) => record.seq) }).toEqual({
      first: [1, 2],
      second: [3, 4],
    });
  });

  it("gives a full page a nextCursor equal to its last seq", async () => {
    await fiveLogsFor(VISIT_A);

    const page = await store().list(VISIT_A, "log", { limit: 2 });

    expect(page.nextCursor).toBe(2);
  });

  it("gives a page short of the limit a null nextCursor", async () => {
    await fiveLogsFor(VISIT_A);

    const page = await store().list(VISIT_A, "log", { after: 3, limit: 10 });

    expect(page.nextCursor).toBeNull();
  });

  it("never returns another kind's records", async () => {
    await store().append(VISIT_A, [{ kind: "turn", body: {}, occurredAt: FIXED_AT }]);

    const page = await store().list(VISIT_A, "log", { limit: 10 });

    expect(page.items).toHaveLength(0);
  });

  it("never returns another visit's records", async () => {
    await store().append(VISIT_B, [{ kind: "log", body: {}, occurredAt: FIXED_AT }]);

    const page = await store().list(VISIT_A, "log", { limit: 10 });

    expect(page.items).toHaveLength(0);
  });
});
