// What this process is told at start. Each half runs only when it has what it needs, so one deployment may be the receiver alone, the station alone, or both.
import { readFileSync } from "node:fs";
import { appTokens, fixedToken, scopedTokens, type AppCredentials, type ScopedTokenFor, type TokenFor } from "./github-auth.js";

export interface Config {
  floorUrl: string;
  floorToken: string;
  port: number;
  apiUrl: string;
  /** Absent: no receiver. */
  webhookSecret?: string;
  /** Absent: no post-review station. */
  tokenFor?: TokenFor;
  /** The review router needs only the floor, so it is asked for by name: `GITHUB_REVIEW_ROUTER=1`. */
  routesReviews: boolean;
  /** Absent: no git credential provider. Asked for by name, `GITHUB_GIT_CREDENTIALS=1`, and only ever as a GitHub App. */
  gitCredentials?: ScopedTokenFor;
}

const DEFAULT_PORT = 8280;

const NO_APP_TO_MINT_WITH = "GITHUB_GIT_CREDENTIALS=1 needs GITHUB_APP_ID and its key: a token given outright is never handed to a pod";

export function loadConfig(env: NodeJS.ProcessEnv, now: () => Date = () => new Date()): Config {
  const apiUrl = env.GITHUB_API_URL ?? "https://api.github.com";
  const app = appOf(env, { apiUrl, now });

  return {
    floorUrl: required(env, "FLOOR_API_URL"),
    floorToken: required(env, "FLOOR_SERVICE_TOKEN"),
    port: Number(env.PORT ?? DEFAULT_PORT),
    apiUrl,
    webhookSecret: env.GITHUB_WEBHOOK_SECRET,
    tokenFor: tokenProvider(env, app),
    routesReviews: env.GITHUB_REVIEW_ROUTER === "1",
    gitCredentials: env.GITHUB_GIT_CREDENTIALS === "1" ? scopedTokens(enforced(app, NO_APP_TO_MINT_WITH)) : undefined,
  };
}

// A token given outright wins over an app: it is the deliberate choice, and the only one a laptop usually has.
function tokenProvider(env: NodeJS.ProcessEnv, app: AppCredentials | undefined): TokenFor | undefined {
  if (env.GITHUB_TOKEN) return fixedToken(env.GITHUB_TOKEN);

  return app && appTokens(app);
}

function appOf(env: NodeJS.ProcessEnv, github: { apiUrl: string; now: () => Date }): AppCredentials | undefined {
  const privateKey = env.GITHUB_APP_PRIVATE_KEY ?? keyFrom(env.GITHUB_APP_PRIVATE_KEY_FILE);

  return env.GITHUB_APP_ID && privateKey ? { appId: env.GITHUB_APP_ID, privateKey, ...github } : undefined;
}

function keyFrom(file: string | undefined): string | undefined {
  return file ? readFileSync(file, "utf8") : undefined;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  return enforced(env[name], `missing required environment variable ${name}`);
}

function enforced<Given>(given: Given | undefined, otherwise: string): Given {
  if (!given) throw new Error(otherwise);

  return given;
}
