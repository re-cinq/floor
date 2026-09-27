// One pool per process, and the plain migration runner: apply every
// `migrations/*.sql` file once, tracked by filename, in order. No
// framework, because six tables in one file (plus whatever a later
// migration adds) does not need one.

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const { Pool } = pg;
export type { Pool as PgPool, PoolClient } from "pg";

export function createPool(connectionString: string): pg.Pool {
  return new Pool({ connectionString });
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export async function migrate(pool: pg.Pool, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await pool.query(
    `create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`,
  );

  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];

  for (const file of files) {
    const { rowCount } = await pool.query(
      `select 1 from schema_migrations where name = $1`,
      [file],
    );

    if (rowCount) continue;

    const sql = await readFile(join(dir, file), "utf8");
    const client = await pool.connect();

    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(`insert into schema_migrations (name) values ($1)`, [file]);
      await client.query("commit");
      applied.push(file);
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  return applied;
}
