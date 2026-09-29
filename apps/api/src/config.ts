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
  reapMs: number;
  /** Absent: no git credential is given, and a visit that would write to a repository is not dispatched. */
  gitCredentialUrl?: string;
  /** What the floor presents to that provider; never the service token, which opens the whole floor. */
  gitCredentialToken?: string;
}

const DEFAULT_PORT = 8080;
const DEFAULT_POLL_MS = 500;
const DEFAULT_SWEEP_MS = 30_000;
const DEFAULT_REAP_MS = 3_600_000;

/** "floor" in ASCII; every instance on one database contends for the same key. */
export const FLOOR_LEASE_KEY = 0x666c6f6f72n;

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const gitCredentialUrl = env.FLOOR_GIT_CREDENTIAL_URL || undefined;

  return {
    port: numberOf(env.PORT, DEFAULT_PORT),
    databaseUrl: env.FLOOR_DATABASE_URL ?? "postgres://postgres:floor@localhost:5433/floor",
    serviceToken: enforceEnv(env, "FLOOR_SERVICE_TOKEN"),
    visitTokenSecret: enforceEnv(env, "FLOOR_VISIT_TOKEN_SECRET"),
    baseUrl: env.FLOOR_BASE_URL ?? "http://localhost:8080",
    leaseKey: FLOOR_LEASE_KEY,
    pollMs: numberOf(env.FLOOR_POLL_MS, DEFAULT_POLL_MS),
    sweepMs: numberOf(env.FLOOR_SWEEP_MS, DEFAULT_SWEEP_MS),
    reapMs: numberOf(env.FLOOR_REAP_MS, DEFAULT_REAP_MS),
    gitCredentialUrl,
    gitCredentialToken: gitCredentialUrl ? enforceEnv(env, "FLOOR_GIT_CREDENTIAL_TOKEN") : undefined,
  };
}

function numberOf(given: string | undefined, otherwise: number): number {
  const parsed = Number(given);

  return given && Number.isFinite(parsed) ? parsed : otherwise;
}

function enforceEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];

  if (!value) throw new Error(`missing required environment variable ${name}`);

  return value;
}
