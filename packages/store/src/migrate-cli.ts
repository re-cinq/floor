#!/usr/bin/env node
import { createPool, migrate } from "./pg.js";

async function main(): Promise<void> {
  const connectionString = process.env.FLOOR_DATABASE_URL;

  if (!connectionString) {
    throw new Error("FLOOR_DATABASE_URL is required");
  }
  const pool = createPool(connectionString);

  try {
    const applied = await migrate(pool);

    console.log(applied.length ? `applied: ${applied.join(", ")}` : "up to date");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
