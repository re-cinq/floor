import { beforeEach, describe, expect, it } from "vitest";
import { BlobsStore, MAX_BLOB_BYTES } from "./blobs.js";
import { setupTestPool } from "./pg-test-pool.js";

const pool = setupTestPool();

beforeEach(async () => {
  await pool().query("truncate blobs, assembly_runs, station_runs restart identity cascade");
});

function store(): BlobsStore {
  return new BlobsStore({ connection: pool() });
}

describe("BlobsStore.put", () => {
  it("returns the sha256 of the bytes, prefixed", async () => {
    const { hash } = await store().put(Buffer.from("hello"));

    expect(hash).toBe("sha256-2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("returns the byte count as size", async () => {
    const { size } = await store().put(Buffer.from("hello"));

    expect(size).toBe(5);
  });

  it("is idempotent: putting the same bytes twice returns the same hash", async () => {
    const first = await store().put(Buffer.from("hello"));
    const second = await store().put(Buffer.from("hello"));

    expect(second.hash).toBe(first.hash);
  });

  it("refuses a blob over the size cap", async () => {
    await expect(store().put(Buffer.alloc(MAX_BLOB_BYTES + 1))).rejects.toThrow(/exceeds the/);
  });
});

describe("BlobsStore.get", () => {
  it("returns the stored bytes and content type", async () => {
    const { hash } = await store().put(Buffer.from("hello"), "text/plain");

    const blob = await store().get(hash);

    expect({ bytes: blob!.bytes.toString(), contentType: blob!.contentType }).toEqual({ bytes: "hello", contentType: "text/plain" });
  });

  it("returns null for a hash that was never put", async () => {
    expect(await store().get("sha256-nonexistent")).toBeNull();
  });
});

describe("BlobsStore.reapUnreferenced", () => {
  it("keeps a blob referenced by a start item's ref", async () => {
    const { hash } = await store().put(Buffer.from("kept"));
    await pool().query(
      `insert into assembly_runs (id, line_id, line_hash, repo, start_items) values (gen_random_uuid(), 'l', 'h', 'r', $1::jsonb)`,
      [JSON.stringify({ finding: { kind: "file", ref: hash, by: "start" } })],
    );

    const reaped = await store().reapUnreferenced();

    expect(reaped).not.toContain(hash);
  });

  it("keeps a blob referenced by a produced report value", async () => {
    const { hash } = await store().put(Buffer.from("kept"));
    const run = await pool().query(
      `insert into assembly_runs (id, line_id, line_hash, repo, start_items) values (gen_random_uuid(), 'l', 'h', 'r', '{}'::jsonb) returning id`,
    );
    const runRow = run.rows[0];
    const runId: string = runRow.id;

    await pool().query(
      `insert into station_runs (station_run_id, assembly_run_id, node_id, iteration, input, report)
       values (gen_random_uuid(), $1, 'n', 1, '{}'::jsonb, $2::jsonb)`,
      [runId, JSON.stringify({ outcome: "success", produced: { finding: hash } })],
    );

    const reaped = await store().reapUnreferenced();

    expect(reaped).not.toContain(hash);
  });

  it("reaps a blob nothing references", async () => {
    const { hash } = await store().put(Buffer.from("orphan"));

    const reaped = await store().reapUnreferenced();

    expect(reaped).toContain(hash);
  });

  it("removes a reaped blob from the store", async () => {
    const { hash } = await store().put(Buffer.from("orphan"));

    await store().reapUnreferenced();

    expect(await store().get(hash)).toBeNull();
  });
});
