// How this app proves to GitHub who it is: a token it was given, or as a GitHub App, which signs a short-lived claim with its key and trades it for a token good for one repository's installation.
import { createSign } from "node:crypto";

const REQUEST_TIMEOUT_MS = 30_000;
const MS_PER_SECOND = 1000;
/** GitHub allows ten minutes; nine leaves room for a clock that runs fast. */
const CLAIM_LIFETIME_SECONDS = 540;
/** Issued a minute ago, for a clock that runs slow. */
const CLAIM_BACKDATE_SECONDS = 60;
/** A token this close to expiring is not handed out. */
const EXPIRY_MARGIN_MS = 60_000;

export interface Repository {
  owner: string;
  name: string;
}

export type TokenFor = (repository: Repository) => Promise<string>;

export type Access = "read" | "write";

export type ScopedTokenFor = (repository: Repository, access: Access) => Promise<string>;

export interface AppCredentials {
  appId: string;
  privateKey: string;
  apiUrl: string;
  now: () => Date;
}

export function fixedToken(token: string): TokenFor {
  return () => Promise.resolve(token);
}

export function appClaim(credentials: Pick<AppCredentials, "appId" | "privateKey" | "now">): string {
  const issued = Math.floor(credentials.now().getTime() / MS_PER_SECOND);
  const claim = { iat: issued - CLAIM_BACKDATE_SECONDS, exp: issued + CLAIM_LIFETIME_SECONDS, iss: credentials.appId };
  const unsigned = `${encoded({ alg: "RS256", typ: "JWT" })}.${encoded(claim)}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(credentials.privateKey, "base64url");

  return `${unsigned}.${signature}`;
}

function encoded(part: object): string {
  return Buffer.from(JSON.stringify(part)).toString("base64url");
}

interface Held {
  token: string;
  expires: Date;
}

/** One token per repository, kept until it is about to expire. */
export function appTokens(credentials: AppCredentials): TokenFor {
  const held = new Map<string, Held>();

  return async (repository) => {
    const key = `${repository.owner}/${repository.name}`;
    const kept = held.get(key);

    if (kept && kept.expires.getTime() - credentials.now().getTime() > EXPIRY_MARGIN_MS) return kept.token;
    const fresh = await installationToken(credentials, repository);

    held.set(key, fresh);

    return fresh.token;
  };
}

/** A token for that one repository's contents and nothing else the app may do, minted each time: it is handed to a pod, and is never the token this app works with itself. */
export function scopedTokens(credentials: AppCredentials): ScopedTokenFor {
  return async (repository, access) => {
    const scoped = await installationToken(credentials, repository, { repositories: [repository.name], permissions: { contents: access } });

    return scoped.token;
  };
}

async function installationToken(credentials: AppCredentials, repository: Repository, narrowedTo?: object): Promise<Held> {
  const claim = appClaim(credentials);
  const installation = await asked<{ id: number }>(credentials, claim, { method: "GET", path: `/repos/${repository.owner}/${repository.name}/installation` });
  const granted = await asked<Granted>(credentials, claim, { method: "POST", path: `/app/installations/${installation.id}/access_tokens`, body: narrowedTo });

  return { token: granted.token, expires: new Date(granted.expires_at) };
}

// GitHub's own field name.
/* eslint-disable @typescript-eslint/naming-convention */
interface Granted {
  token: string;
  expires_at: string;
}
/* eslint-enable @typescript-eslint/naming-convention */

async function asked<Answer>(credentials: AppCredentials, claim: string, request: { method: string; path: string; body?: object }): Promise<Answer> {
  const response = await fetch(`${credentials.apiUrl}${request.path}`, {
    method: request.method,
    headers: { authorization: `Bearer ${claim}`, accept: "application/vnd.github+json", "content-type": "application/json" },
    body: request.body && JSON.stringify(request.body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`GitHub answered ${response.status} to ${request.method} ${request.path}: ${await response.text()}`);

  return (await response.json()) as Answer;
}
