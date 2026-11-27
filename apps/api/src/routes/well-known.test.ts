import { describe, expect, it } from "vitest";
import { loadGatewayKeys, thumbprintOf } from "../gateway-keys.js";
import { ed25519Jwk, ed25519TestKey } from "../gateway-test-keys.js";
import { setupTestServer } from "../test-server.js";

const SIGNING = ed25519TestKey();
const RETIRED = ed25519TestKey();
const gatewayKeys = loadGatewayKeys({ FLOOR_GATEWAY_SIGNING_KEY: SIGNING.pem, FLOOR_GATEWAY_RETIRED_KEYS: JSON.stringify([ed25519Jwk(RETIRED.publicPart)]) });

const { server } = setupTestServer({ gatewayKeys });

describe("GET /.well-known/jwks.json", () => {
  it("lists the signing key, then the retired one, with no bearer token", async () => {
    const response = await server().inject({ method: "GET", url: "/.well-known/jwks.json" });
    const body = JSON.parse(response.payload) as { keys: { x: string }[] };

    expect({ statusCode: response.statusCode, keys: body.keys.map((key) => key.x) }).toEqual({ statusCode: 200, keys: [SIGNING.publicPart, RETIRED.publicPart] });
  });

  it("gives each key its id, its use and its algorithm, and no private member", async () => {
    const response = await server().inject({ method: "GET", url: "/.well-known/jwks.json" });
    const body = JSON.parse(response.payload) as { keys: Record<string, string>[] };
    const published = { kty: "OKP", crv: "Ed25519", use: "sig", alg: "EdDSA" };

    expect(body.keys).toEqual([
      { ...ed25519Jwk(SIGNING.publicPart, published), kid: gatewayKeys.signing?.kid },
      { ...ed25519Jwk(RETIRED.publicPart, published), kid: thumbprintOf(RETIRED.publicPart) },
    ]);
  });

  it("lets a reader keep the answer for five minutes", async () => {
    const response = await server().inject({ method: "GET", url: "/.well-known/jwks.json" });

    expect(response.headers["cache-control"]).toBe("public, max-age=300");
  });
});
