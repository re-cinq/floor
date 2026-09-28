import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INSTALLATION_TOKEN, startFakeGitHub, type FakeGitHub } from "./fake-github.js";
import { appTokens, fixedToken, type TokenFor } from "./github-auth.js";

const NOW = new Date("2026-01-01T00:00:00Z");
const EXPIRES = new Date("2026-01-01T01:00:00Z");
const NEARLY_EXPIRED = new Date("2026-01-01T00:59:30Z");
const FLOOR = { owner: "re-cinq", name: "floor" };
const KEYS = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
const STRANGER = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });

let github: FakeGitHub;

beforeAll(async () => {
  github = await startFakeGitHub(KEYS.publicKey, EXPIRES);
});

afterAll(async () => {
  await github.close();
});

function tokens(privateKey: string, now: () => Date = () => NOW): TokenFor {
  return appTokens({ appId: "12345", privateKey, apiUrl: github.apiUrl, now });
}

function grants(): number {
  const asked = github.asked;

  return asked.filter((request) => request.includes("access_tokens")).length;
}

describe("appTokens", () => {
  it("trades the app's signed claim for a token for the repository's installation", async () => {
    expect(await tokens(KEYS.privateKey)(FLOOR)).toBe(INSTALLATION_TOKEN);
  });

  it("forged app: a claim signed with another key is refused by GitHub", async () => {
    await expect(tokens(STRANGER.privateKey)(FLOOR)).rejects.toThrow(/GitHub answered 401/);
  });

  it("asks once for a repository, and hands the same token out again", async () => {
    const tokenFor = tokens(KEYS.privateKey);
    const before = grants();

    await tokenFor(FLOOR);
    await tokenFor(FLOOR);

    expect(grants() - before).toBe(1);
  });

  it("asks again for a token about to expire", async () => {
    const clock = [NOW, NEARLY_EXPIRED, NEARLY_EXPIRED, NEARLY_EXPIRED];
    const tokenFor = tokens(KEYS.privateKey, () => clock.shift() ?? NEARLY_EXPIRED);
    const before = grants();

    await tokenFor(FLOOR);
    await tokenFor(FLOOR);

    expect(grants() - before).toBe(2);
  });
});

describe("fixedToken", () => {
  it("hands out the token it was given, for any repository", async () => {
    expect(await fixedToken("ghp_given")(FLOOR)).toBe("ghp_given");
  });
});
