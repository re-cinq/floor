import { verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadGatewayKeys, type SigningKey } from "./gateway-keys.js";
import { ed25519TestKey, partsOf } from "./gateway-test-keys.js";
import { mintGatewayToken, type GatewayTokenAsk } from "./gateway-token.js";

const NOW = new Date("2026-01-01T00:00:00Z");
const NOW_SECONDS = 1_767_225_600;
const HOUR_SECONDS = 3600;
const DAY_MS = 86_400_000;

const KEY = ed25519TestKey();
const SIGNING = loadGatewayKeys({ FLOOR_GATEWAY_SIGNING_KEY: KEY.pem }).signing as SigningKey;

const ASK: GatewayTokenAsk = {
  issuer: "https://floor.example.com",
  audience: "search",
  visitId: "visit-1",
  runId: "run-1",
  repo: "github.com/acme/widgets",
  scopes: ["context:read", "memory:write"],
  deadline: new Date("2026-01-01T01:00:00Z"),
  now: NOW,
};

function minted(changed: Partial<GatewayTokenAsk> = {}) {
  return partsOf(mintGatewayToken({ ...ASK, ...changed }, SIGNING));
}

describe("mintGatewayToken", () => {
  it("signs a token that verifies with the signing key's public part", () => {
    const { signingInput, signature } = minted();

    expect(verify(null, signingInput, KEY.publicKey, signature)).toBe(true);
  });

  it("signs a token that does not verify with another key", () => {
    const { signingInput, signature } = minted();

    expect(verify(null, signingInput, ed25519TestKey().publicKey, signature)).toBe(false);
  });

  it("is three base64url parts with no padding", () => {
    expect(mintGatewayToken(ASK, SIGNING)).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it("says in its header how it was signed and by which key", () => {
    expect(minted().header).toEqual({ alg: "EdDSA", typ: "JWT", kid: SIGNING.kid });
  });

  it("claims the visit, its run and repository, who it is for and until when, and nothing else", () => {
    expect(minted().claims).toEqual({
      iss: "https://floor.example.com",
      aud: "search",
      sub: "visit-1",
      run: "run-1",
      repo: "github.com/acme/widgets",
      scope: "context:read memory:write",
      iat: NOW_SECONDS,
      exp: NOW_SECONDS + HOUR_SECONDS,
    });
  });

  it("names the repository in lower case", () => {
    expect(minted({ repo: "GitHub.com/Acme/Widgets" }).claims.repo).toBe("github.com/acme/widgets");
  });

  it("claims an empty scope for a server given none", () => {
    expect(minted({ scopes: [] }).claims.scope).toBe("");
  });

  it("signs for a deadline exactly 24 hours away", () => {
    expect(minted({ deadline: new Date(NOW.getTime() + DAY_MS) }).claims.exp).toBe(NOW_SECONDS + 24 * HOUR_SECONDS);
  });

  it("refuses a deadline more than 24 hours away", () => {
    expect(() => minted({ deadline: new Date(NOW.getTime() + DAY_MS + 1000) })).toThrow("a gateway token cannot be signed for a visit whose deadline is more than 24 hours away");
  });

  it.each([
    ["in the past", new Date("2025-12-31T23:00:00Z")],
    ["now", NOW],
  ])("refuses a deadline %s", (described, deadline) => {
    expect(() => minted({ deadline })).toThrow("a gateway token cannot be signed for a visit whose deadline has passed");
  });

  it.each([
    ["none", null],
    ["a bare name", "widgets"],
    ["no host", "acme/widgets"],
    ["an empty part", "github.com//widgets"],
    ["four parts", "github.com/acme/widgets/extra"],
  ])("refuses a run whose repository is %s", (described, repo) => {
    expect(() => minted({ repo })).toThrow(/names the run's repository as host\/owner\/name/);
  });
});
