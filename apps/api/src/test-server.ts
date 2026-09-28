// Shared fixture for the route test files: one real server over one real Postgres instance, migrated once.
import { afterAll, beforeAll, beforeEach } from "vitest";
import type { Server, ServerInjectOptions } from "@hapi/hapi";
import { openTestPool, testDatabaseUrl, type PgPool } from "@floor/store";
import type { Config } from "./config.js";
import { buildDeps, type Deps } from "./deps.js";
import { buildLoop, type FloorLoop } from "./engine/loop.js";
import { buildServer } from "./server.js";

export const SERVICE_TOKEN = "test-service-token";
export const VISIT_TOKEN_SECRET = "test-visit-token-secret";
const FIXED_NOW = new Date("2026-01-01T00:00:00Z");

/** Not the process's own key, so a suite never contends with a floor running against the same database. */
const TEST_LEASE_KEY = 0x74657374n;

const TEST_CONFIG: Config = {
  port: 0,
  databaseUrl: testDatabaseUrl(),
  serviceToken: SERVICE_TOKEN,
  visitTokenSecret: VISIT_TOKEN_SECRET,
  baseUrl: "http://localhost:0",
  leaseKey: TEST_LEASE_KEY,
  pollMs: 10,
  sweepMs: 0,
};

export interface TestServer {
  server: () => Server;
  loop: () => FloorLoop;
  deps: () => Deps;
  pool: () => PgPool;
}

export function authHeaders(): Record<string, string> {
  return { authorization: `Bearer ${SERVICE_TOKEN}` };
}

export interface Injected<T> {
  statusCode: number;
  result: T;
  rawPayload: Buffer;
}

/** hapi's own inject() types `result` as a plain `object`; every test wants its actual shape, known only here at the call site. */
export async function injectJson<T = Record<string, never>>(server: Server, options: ServerInjectOptions): Promise<Injected<T>> {
  const response = await server.inject(options);

  return { statusCode: response.statusCode, result: response.result as T, rawPayload: response.rawPayload };
}

export function setupTestServer(): TestServer {
  let pool: PgPool;
  let deps: Deps;
  let server: Server;
  let loop: FloorLoop;

  beforeAll(async () => {
    pool = await openTestPool();
    deps = buildDeps(pool, TEST_CONFIG, () => FIXED_NOW);
    loop = buildLoop(deps, "floor-test");
    server = await buildServer(deps, () => loop.holdsLease());
  });

  beforeEach(async () => {
    await pool.query("truncate definitions, assembly_runs, station_runs, station_run_records, events, blobs restart identity cascade");
  });

  afterAll(async () => {
    await loop.stop();
    await server.stop();
    await pool.end();
  });

  return { server: () => server, loop: () => loop, deps: () => deps, pool: () => pool };
}
