// Shared fixture for the route test files: one real server over one real Postgres instance, migrated once.
import { afterAll, beforeAll, beforeEach } from "vitest";
import type { Server, ServerInjectOptions } from "@hapi/hapi";
import { createPool, migrate, type PgPool } from "@floor/store";
import type { Config } from "./config.js";
import { buildDeps, type Deps } from "./deps.js";
import { buildServer } from "./server.js";

export const SERVICE_TOKEN = "test-service-token";
export const VISIT_TOKEN_SECRET = "test-visit-token-secret";
const FIXED_NOW = new Date("2026-01-01T00:00:00Z");

const connectionString =
  process.env.FLOOR_DATABASE_URL ?? "postgres://postgres:floor@localhost:5433/floor";

export interface TestServer {
  server: () => Server;
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

  beforeAll(async () => {
    pool = createPool(connectionString);
    await migrate(pool);
    const config: Config = {
      port: 0,
      databaseUrl: connectionString,
      serviceToken: SERVICE_TOKEN,
      visitTokenSecret: VISIT_TOKEN_SECRET,
      baseUrl: "http://localhost:0",
    };

    deps = buildDeps(pool, config, () => FIXED_NOW);
    server = await buildServer(deps);
  });

  beforeEach(async () => {
    await pool.query("truncate definitions, assembly_runs, station_runs, events, blobs restart identity cascade");
  });

  afterAll(async () => {
    await server.stop();
    await pool.end();
  });

  return { server: () => server, deps: () => deps, pool: () => pool };
}
