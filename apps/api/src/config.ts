// Process configuration, read once at startup from the environment.

export interface Config {
  port: number;
  databaseUrl: string;
  serviceToken: string;
  visitTokenSecret: string;
  baseUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  return {
    port: Number(env.PORT ?? "8080"),
    databaseUrl: env.FLOOR_DATABASE_URL ?? "postgres://postgres:floor@localhost:5433/floor",
    serviceToken: enforceEnv(env, "FLOOR_SERVICE_TOKEN"),
    visitTokenSecret: enforceEnv(env, "FLOOR_VISIT_TOKEN_SECRET"),
    baseUrl: env.FLOOR_BASE_URL ?? "http://localhost:8080",
  };
}

function enforceEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];

  if (!value) throw new Error(`missing required environment variable ${name}`);

  return value;
}
