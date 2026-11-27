import { createHash, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadGatewayKeys, thumbprintOf } from "./gateway-keys.js";
import { ed25519Jwk, ed25519TestKey } from "./gateway-test-keys.js";

const RFC_8037_PUBLIC_PART = "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo";
const RFC_8037_THUMBPRINT = "kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k";
const PUBLISHED = { use: "sig", alg: "EdDSA" };

function thumbprintByHand(publicPart: string): string {
  const canonical = `{"crv":"Ed25519","kty":"OKP","x":${JSON.stringify(publicPart)}}`;

  return createHash("sha256").update(canonical).digest("base64url");
}

function retired(...entries: unknown[]): NodeJS.ProcessEnv {
  return { FLOOR_GATEWAY_RETIRED_KEYS: JSON.stringify(entries) };
}

describe("thumbprintOf", () => {
  it("gives the thumbprint RFC 8037 appendix A.3 states for its example Ed25519 key", () => {
    expect(thumbprintOf(RFC_8037_PUBLIC_PART)).toBe(RFC_8037_THUMBPRINT);
  });
});

describe("loadGatewayKeys", () => {
  it("holds no key and publishes none when neither variable is set", () => {
    expect(loadGatewayKeys({})).toEqual({ signing: null, published: [] });
  });

  it("names the signing key by the thumbprint of its public part", () => {
    const key = ed25519TestKey();

    expect(loadGatewayKeys({ FLOOR_GATEWAY_SIGNING_KEY: key.pem }).signing?.kid).toBe(thumbprintByHand(key.publicPart));
  });

  it("publishes the signing key's public part, marked for EdDSA signatures", () => {
    const key = ed25519TestKey();

    expect(loadGatewayKeys({ FLOOR_GATEWAY_SIGNING_KEY: key.pem }).published).toEqual([ed25519Jwk(key.publicPart, { ...PUBLISHED, kid: thumbprintByHand(key.publicPart) })]);
  });

  it("publishes the signing key first, then the retired keys in the order given", () => {
    const [signing, older, oldest] = [ed25519TestKey(), ed25519TestKey(), ed25519TestKey()];
    const keys = loadGatewayKeys({ FLOOR_GATEWAY_SIGNING_KEY: signing.pem, ...retired(ed25519Jwk(older.publicPart), ed25519Jwk(oldest.publicPart)) });

    expect(keys.published.map((key) => key.x)).toEqual([signing.publicPart, older.publicPart, oldest.publicPart]);
  });

  it("publishes retired keys on a floor that signs with none", () => {
    const keys = loadGatewayKeys(retired(ed25519Jwk(RFC_8037_PUBLIC_PART)));

    expect({ signing: keys.signing, kids: keys.published.map((key) => key.kid) }).toEqual({ signing: null, kids: [RFC_8037_THUMBPRINT] });
  });

  it("publishes a key once when the signing key is also listed as retired", () => {
    const key = ed25519TestKey();
    const keys = loadGatewayKeys({ FLOOR_GATEWAY_SIGNING_KEY: key.pem, ...retired(ed25519Jwk(key.publicPart)) });

    expect(keys.published).toHaveLength(1);
  });

  it("publishes only a retired key's public members, whatever else its entry carries", () => {
    const keys = loadGatewayKeys(retired(ed25519Jwk(RFC_8037_PUBLIC_PART, { kid: "mine", note: "kept by hand" })));

    expect(keys.published).toEqual([ed25519Jwk(RFC_8037_PUBLIC_PART, { ...PUBLISHED, kid: RFC_8037_THUMBPRINT })]);
  });

  it("refuses a signing key that is not Ed25519, naming the variable", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

    expect(() => loadGatewayKeys({ FLOOR_GATEWAY_SIGNING_KEY: pem })).toThrow(new Error("FLOOR_GATEWAY_SIGNING_KEY must be an Ed25519 private key, as PKCS#8 PEM"));
  });

  it("refuses a signing key that is no key at all, without repeating it", () => {
    expect(() => loadGatewayKeys({ FLOOR_GATEWAY_SIGNING_KEY: "not-a-key" })).toThrow(new Error("FLOOR_GATEWAY_SIGNING_KEY must be an Ed25519 private key, as PKCS#8 PEM"));
  });

  it("refuses a retired key that carries its private member", () => {
    const withPrivateMember = ed25519Jwk(RFC_8037_PUBLIC_PART, Object.fromEntries([["d", "private"]]));

    expect(() => loadGatewayKeys(retired(withPrivateMember))).toThrow(new Error(`FLOOR_GATEWAY_RETIRED_KEYS: entry 0 carries a private member "d"; list the public key alone`));
  });

  it.each([
    ["an RSA key", { kty: "RSA" }],
    ["on another curve", ed25519Jwk(RFC_8037_PUBLIC_PART, { crv: "X25519" })],
    ["a public part that is not 32 bytes", ed25519Jwk("AAAA")],
    ["a public part that is not base64url", ed25519Jwk(`${RFC_8037_PUBLIC_PART.slice(0, -1)}=`)],
    ["without a public part", { kty: "OKP", crv: "Ed25519" }],
    ["a string", "key"],
  ])("refuses a retired entry that is %s, naming its position", (described, entry) => {
    expect(() => loadGatewayKeys(retired(ed25519Jwk(RFC_8037_PUBLIC_PART), entry))).toThrow(/^FLOOR_GATEWAY_RETIRED_KEYS: entry 1 is not a public Ed25519 key/);
  });

  it.each([
    ["an object", "{}"],
    ["not JSON", "[{"],
  ])("refuses retired keys given as %s", (described, value) => {
    expect(() => loadGatewayKeys({ FLOOR_GATEWAY_RETIRED_KEYS: value })).toThrow(new Error("FLOOR_GATEWAY_RETIRED_KEYS must be a JSON array of public Ed25519 keys, each a JWK"));
  });
});
