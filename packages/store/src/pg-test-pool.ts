// The pool lifecycle every store test file shares: open the test database once, close at the end.
import { afterAll, beforeAll } from "vitest";
import type { PgPool } from "./pg.js";
import { openTestPool, testDatabaseUrl } from "./test-database.js";

export const connectionString = testDatabaseUrl();

export function setupTestPool(): () => PgPool {
  let pool: PgPool;

  beforeAll(async () => {
    pool = await openTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  return () => pool;
}
