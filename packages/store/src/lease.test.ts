import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, type PgPool } from "./pg.js";
import { acquireLease } from "./lease.js";
import { connectionString } from "./pg-test-pool.js";

let poolA: PgPool;
let poolB: PgPool;

beforeAll(() => {
  poolA = createPool(connectionString);
  poolB = createPool(connectionString);
});

afterAll(async () => {
  await poolA.end();
  await poolB.end();
});

let nextKey = 918_273_645n;

function leaseKey(): bigint {
  nextKey += 1n;

  return nextKey;
}

describe("acquireLease", () => {
  it("acquires an unheld key", async () => {
    const lease = await acquireLease(poolA, leaseKey());

    expect(lease).not.toBeNull();

    await lease!.release();
  });

  it("returns null for a key another pool already holds", async () => {
    const key = leaseKey();
    const held = await acquireLease(poolA, key);

    const contended = await acquireLease(poolB, key);

    expect(contended).toBeNull();

    await held!.release();
  });

  it("lets a second pool acquire the key once the first releases it", async () => {
    const key = leaseKey();
    const held = await acquireLease(poolA, key);
    await held!.release();

    const afterRelease = await acquireLease(poolB, key);

    expect(afterRelease).not.toBeNull();

    await afterRelease!.release();
  });

  it("is a no-op on a second release of the same lease", async () => {
    const key = leaseKey();
    const lease = await acquireLease(poolA, key);
    await lease!.release();

    await expect(lease!.release()).resolves.toBeUndefined();
  });
});
