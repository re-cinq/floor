import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPool, migrate, type PgPool } from "./pg.js";
import { connectionString } from "./pg-test-pool.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "slow-migrations");
const SCHEMA = "migrate_test";
const SLOW_FILE = "0001_slow.sql";

let admin: PgPool;
let poolA: PgPool;
let poolB: PgPool;

beforeEach(async () => {
  admin = createPool(connectionString);
  await admin.query(`drop schema if exists ${SCHEMA} cascade`);
  await admin.query(`create schema ${SCHEMA}`);
  poolA = createPool(inSchema(connectionString));
  poolB = createPool(inSchema(connectionString));
});

afterEach(async () => {
  await admin.query(`drop schema if exists ${SCHEMA} cascade`);
  await Promise.all([admin.end(), poolA.end(), poolB.end()]);
});

function inSchema(url: string): string {
  const target = new URL(url);

  target.searchParams.set("options", `-c search_path=${SCHEMA}`);

  return target.toString();
}

describe("migrate", () => {
  it("applies a migration once when two pools migrate at the same moment", async () => {
    const runs = await Promise.all([migrate(poolA, FIXTURE_DIR), migrate(poolB, FIXTURE_DIR)]);

    expect(runs.filter((applied) => applied.includes(SLOW_FILE))).toHaveLength(1);
  });

  it("lets a second migrate run once the first is done", async () => {
    await migrate(poolA, FIXTURE_DIR);

    expect(await migrate(poolB, FIXTURE_DIR)).toEqual([]);
  });
});
