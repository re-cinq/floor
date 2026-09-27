// One pool per process, and the plain migration runner: apply every migrations/*.sql file once, tracked by filename, in order.

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "pg";

export type { Pool as PgPool, PoolClient } from "pg";

export function createPool(connectionString: string): postgres.Pool {
  return new postgres.Pool({ connectionString });
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export async function migrate(pool: postgres.Pool, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await ensureMigrationsTable(pool);

  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  const applied: string[] = [];

  for (const file of files) {
    if (await isApplied(pool, file)) continue;

    await applyMigration(pool, dir, file);
    applied.push(file);
  }

  return applied;
}

async function ensureMigrationsTable(pool: postgres.Pool): Promise<void> {
  await pool.query(
    `create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`,
  );
}

async function isApplied(pool: postgres.Pool, file: string): Promise<boolean> {
  const { rowCount } = await pool.query(`select 1 from schema_migrations where name = $1`, [file]);

  return Boolean(rowCount);
}

async function applyMigration(pool: postgres.Pool, dir: string, file: string): Promise<void> {
  const sql = await readFile(join(dir, file), "utf8");
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(sql);
    await client.query(`insert into schema_migrations (name) values ($1)`, [file]);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
