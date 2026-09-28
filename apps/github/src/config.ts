// What this process is told at start. Each half runs only when it has what it needs, so one deployment may be the receiver alone, the station alone, or both.
import { readFileSync } from "node:fs";
import { appTokens, fixedToken, type TokenFor } from "./github-auth.js";

export interface Config {
  floorUrl: string;
  floorToken: string;
  port: number;
  apiUrl: string;
  /** Absent: no receiver. */
  webhookSecret?: string;
  /** Absent: no post-review station. */
  tokenFor?: TokenFor;
}

const DEFAULT_PORT = 8280;

export function loadConfig(env: NodeJS.ProcessEnv, now: () => Date = () => new Date()): Config {
  const apiUrl = env.GITHUB_API_URL ?? "https://api.github.com";

  return {
    floorUrl: required(env, "FLOOR_API_URL"),
    floorToken: required(env, "FLOOR_SERVICE_TOKEN"),
    port: Number(env.PORT ?? DEFAULT_PORT),
    apiUrl,
    webhookSecret: env.GITHUB_WEBHOOK_SECRET,
    tokenFor: tokenProvider(env, { apiUrl, now }),
  };
}

// A token given outright wins over an app: it is the deliberate choice, and the only one a laptop usually has.
function tokenProvider(env: NodeJS.ProcessEnv, github: { apiUrl: string; now: () => Date }): TokenFor | undefined {
  if (env.GITHUB_TOKEN) return fixedToken(env.GITHUB_TOKEN);
  const privateKey = env.GITHUB_APP_PRIVATE_KEY ?? keyFrom(env.GITHUB_APP_PRIVATE_KEY_FILE);

  return env.GITHUB_APP_ID && privateKey ? appTokens({ appId: env.GITHUB_APP_ID, privateKey, ...github }) : undefined;
}

function keyFrom(file: string | undefined): string | undefined {
  return file ? readFileSync(file, "utf8") : undefined;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const given = env[name];

  if (!given) throw new Error(`missing required environment variable ${name}`);

  return given;
}
