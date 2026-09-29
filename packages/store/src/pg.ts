// One pool per process, and the plain migration runner: apply every migrations/*.sql file once, tracked by filename, in order.

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "pg";
import { withAdvisoryLock } from "./lease.js";

export type { Pool as PgPool, PoolClient } from "pg";

export function createPool(connectionString: string): postgres.Pool {
  return new postgres.Pool({ connectionString });
}

// Distinct from the floor lease key and the test lease key, so migrating never waits on a floor.
const MIGRATION_LOCK_KEY = 0x6d696772n;

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export async function migrate(pool: postgres.Pool, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  return withAdvisoryLock(pool, MIGRATION_LOCK_KEY, (client) => applyPending(client, dir));
}

async function applyPending(client: postgres.PoolClient, dir: string): Promise<string[]> {
  await client.query(
    `create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`,
  );

  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  const applied: string[] = [];

  for (const file of files) {
    if (await isApplied(client, file)) continue;

    await applyMigration(client, dir, file);
    applied.push(file);
  }

  return applied;
}

async function isApplied(client: postgres.PoolClient, file: string): Promise<boolean> {
  const { rowCount } = await client.query(`select 1 from schema_migrations where name = $1`, [file]);

  return Boolean(rowCount);
}

async function applyMigration(client: postgres.PoolClient, dir: string, file: string): Promise<void> {
  const sql = await readFile(join(dir, file), "utf8");

  try {
    await client.query("begin");
    await client.query(sql);
    await client.query(`insert into schema_migrations (name) values ($1)`, [file]);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}
