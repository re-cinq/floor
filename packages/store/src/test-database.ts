// The database the test suites run against: never the one a floor is running on, since every suite truncates its tables between tests.
import postgres from "pg";
import { createPool, migrate } from "./pg.js";

const DEFAULT_TEST_DATABASE_URL = "postgres://postgres:floor@localhost:5433/floor_test";

export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.FLOOR_TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
}

/** A migrated pool on the test database, created on the server first if it is not there yet. */
export async function openTestPool(connectionString: string = testDatabaseUrl()): Promise<postgres.Pool> {
  await createDatabaseIfMissing(connectionString);
  const pool = createPool(connectionString);

  await migrate(pool);

  return pool;
}

// `create database` cannot run inside the database it creates, nor take its name as a parameter; the name is checked against what Postgres allows unquoted before it is put in the statement.
async function createDatabaseIfMissing(connectionString: string): Promise<void> {
  const target = new URL(connectionString);
  const name = target.pathname.slice(1);

  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`"${name}" is not a database name this will create`);
  target.pathname = "/postgres";
  const admin = new postgres.Client({ connectionString: target.toString() });

  await admin.connect();

  try {
    const { rowCount } = await admin.query(`select 1 from pg_database where datname = $1`, [name]);

    if (!rowCount) await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }
}
