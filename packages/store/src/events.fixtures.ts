// Shared Postgres-backed fixture for the EventStore test files, so the pool lifecycle never drifts into two copies.
import { afterAll, beforeAll, beforeEach } from "vitest";
import type { PgPool } from "./pg.js";
import { openTestPool } from "./test-database.js";
import { EventStore } from "./events.js";

export const FIXED_NOW = new Date("2026-01-01T00:00:00Z");

const RUN_ID_SEQUENCE_DIGITS = 12;

export interface EventsFixture {
  pool: () => PgPool;
  store: (now?: () => Date) => EventStore;
  fakeRunId: () => string;
}

export function setupEventsFixture(): EventsFixture {
  const pool = registerPoolLifecycle();
  let idCounter = 0;

  beforeEach(() => {
    idCounter = 0;
  });

  const store = (now: () => Date = () => FIXED_NOW): EventStore => new EventStore({ connection: pool(), now });

  const fakeRunId = (): string => {
    idCounter += 1;

    return `00000000-0000-4000-8000-${String(idCounter).padStart(RUN_ID_SEQUENCE_DIGITS, "0")}`;
  };

  return { pool, store, fakeRunId };
}

function registerPoolLifecycle(): () => PgPool {
  let pool: PgPool;

  beforeAll(async () => {
    pool = await openTestPool();
  });

  beforeEach(async () => {
    await pool.query("truncate events restart identity");
  });

  afterAll(async () => {
    await pool.end();
  });

  return () => pool;
}
