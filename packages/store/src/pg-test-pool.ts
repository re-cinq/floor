// The pool lifecycle every store test file shares: connect once, migrate, close at the end.
import { afterAll, beforeAll } from "vitest";
import { createPool, migrate, type PgPool } from "./pg.js";

export const connectionString =
  process.env.FLOOR_DATABASE_URL ?? "postgres://postgres:floor@localhost:5433/floor";

export function setupTestPool(): () => PgPool {
  let pool: PgPool;

  beforeAll(async () => {
    pool = createPool(connectionString);
    await migrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  return () => pool;
}
