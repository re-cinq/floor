// Process configuration, read once at startup from the environment.

export interface Config {
  port: number;
  databaseUrl: string;
  serviceToken: string;
  visitTokenSecret: string;
  baseUrl: string;
  leaseKey: bigint;
  pollMs: number;
  sweepMs: number;
}

/** "floor" in ASCII; every instance on one database contends for the same key. */
export const FLOOR_LEASE_KEY = 0x666c6f6f72n;

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  return {
    port: Number(env.PORT ?? "8080"),
    databaseUrl: env.FLOOR_DATABASE_URL ?? "postgres://postgres:floor@localhost:5433/floor",
    serviceToken: enforceEnv(env, "FLOOR_SERVICE_TOKEN"),
    visitTokenSecret: enforceEnv(env, "FLOOR_VISIT_TOKEN_SECRET"),
    baseUrl: env.FLOOR_BASE_URL ?? "http://localhost:8080",
    leaseKey: FLOOR_LEASE_KEY,
    pollMs: Number(env.FLOOR_POLL_MS ?? "500"),
    sweepMs: Number(env.FLOOR_SWEEP_MS ?? "30000"),
  };
}

function enforceEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];

  if (!value) throw new Error(`missing required environment variable ${name}`);

  return value;
}
