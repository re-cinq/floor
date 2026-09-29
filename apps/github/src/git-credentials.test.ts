import { generateKeyPairSync } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INSTALLATION_TOKEN, startFakeGitHub, type FakeGitHub } from "./fake-github.js";
import { GIT_CREDENTIALS_PATH, gitCredentialRoute, repositoryAt } from "./git-credentials.js";
import { scopedTokens } from "./github-auth.js";
import { buildHttpServer } from "./http.js";

const NOW = new Date("2026-01-01T00:00:00Z");
const EXPIRES = new Date("2026-01-01T01:00:00Z");
const SERVICE_TOKEN = "floor-service-token";
const KEYS = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });

let github: FakeGitHub;
let provider: Server;
let url = "";

beforeAll(async () => {
  github = await startFakeGitHub(KEYS.publicKey, EXPIRES);
  const mint = scopedTokens({ appId: "12345", privateKey: KEYS.privateKey, apiUrl: github.apiUrl, now: () => NOW });

  provider = buildHttpServer({ [GIT_CREDENTIALS_PATH]: gitCredentialRoute({ serviceToken: SERVICE_TOKEN, mint }) });
  await new Promise<void>((resolve) => provider.listen(0, resolve));
  url = `http://localhost:${(provider.address() as AddressInfo).port}${GIT_CREDENTIALS_PATH}`;
});

afterAll(async () => {
  await new Promise((resolve) => provider.close(resolve));
  await github.close();
});

interface Asking {
  token?: string;
  noAuth?: boolean;
  body?: unknown;
}

async function ask(asking: Asking = {}): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: headersOf(asking),
    body: JSON.stringify(asking.body ?? { repoUrl: "https://github.com/re-cinq/floor", access: "write" }),
    signal: AbortSignal.timeout(5000),
  });
}

function headersOf(asking: Asking): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };

  if (!asking.noAuth) headers.authorization = `Bearer ${asking.token ?? SERVICE_TOKEN}`;

  return headers;
}

describe("the git credential provider", () => {
  it("answers the floor with the pair git's credential helper reads", async () => {
    const response = await ask();

    expect(await response.json()).toEqual({ username: "x-access-token", password: INSTALLATION_TOKEN });
  });

  it("mints a write token for the contents of floor, and nothing else", async () => {
    await ask();

    expect(github.grants.at(-1)).toEqual({ repositories: ["floor"], permissions: { contents: "write" } });
  });

  it("mints a read token for a need that only reads", async () => {
    await ask({ body: { repoUrl: "https://github.com/re-cinq/floor.git", access: "read" } });

    expect(github.grants.at(-1)).toEqual({ repositories: ["floor"], permissions: { contents: "read" } });
  });

  it("mints a fresh token each time it is asked", async () => {
    const before = github.grants.length;

    await ask();
    await ask();

    expect(github.grants.length - before).toBe(2);
  });

  it("stranger: refuses a caller without the floor's service token", async () => {
    const response = await ask({ token: "someone-else" });

    expect(response.status).toBe(401);
  });

  it("stranger: refuses a caller with no authorization header at all", async () => {
    const response = await ask({ noAuth: true });

    expect(response.status).toBe(401);
  });

  it("stranger: mints nothing for them", async () => {
    const before = github.grants.length;

    await ask({ token: "someone-else" });

    expect(github.grants.length).toBe(before);
  });

  it("answers 400 to an access of admin", async () => {
    const response = await ask({ body: { repoUrl: "https://github.com/re-cinq/floor", access: "admin" } });

    expect(response.status).toBe(400);
  });

  it("answers 404 for a repository on gitlab.com", async () => {
    const response = await ask({ body: { repoUrl: "https://gitlab.com/re-cinq/floor", access: "read" } });

    expect(response.status).toBe(404);
  });
});

describe("repositoryAt", () => {
  it("reads re-cinq/floor from its clone url", () => {
    expect(repositoryAt("https://github.com/re-cinq/floor.git")).toEqual({ owner: "re-cinq", name: "floor" });
  });

  it("reads nothing from a path deeper than owner/name", () => {
    expect(repositoryAt("https://github.com/re-cinq/floor/tree/main")).toBeNull();
  });

  it("reads nothing from github.com.evil.test", () => {
    expect(repositoryAt("https://github.com.evil.test/re-cinq/floor")).toBeNull();
  });

  it("reads nothing from a url over plain http", () => {
    expect(repositoryAt("http://github.com/re-cinq/floor")).toBeNull();
  });
});
