// Keys for the gateway token's tests, made as each suite loads: no key is kept in the repository.
import { generateKeyPairSync, type KeyObject } from "node:crypto";

const ED25519_PUBLIC_KEY_BYTES = 32;

export interface TestKey {
  /** PKCS#8 PEM, as FLOOR_GATEWAY_SIGNING_KEY holds it. */
  pem: string;
  publicKey: KeyObject;
  /** The public key's bytes as base64url, a JWK's `x`, read from its DER encoding and not from a JWK export, so a test compares two derivations. */
  publicPart: string;
}

export function ed25519TestKey(): TestKey {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicPart = publicKey.export({ format: "der", type: "spki" }).subarray(-ED25519_PUBLIC_KEY_BYTES).toString("base64url");

  return { pem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(), publicKey, publicPart };
}

/** A public Ed25519 JWK with this `x`, and whatever other members a test gives it. */
export function ed25519Jwk(publicPart: string, others: Record<string, string> = {}): Record<string, string> {
  return { kty: "OKP", crv: "Ed25519", ...Object.fromEntries([["x", publicPart]]), ...others };
}

/** A token's two JSON parts and the bytes its signature covers. */
export function partsOf(token: string): { header: Record<string, unknown>; claims: Record<string, unknown>; signingInput: Buffer; signature: Buffer } {
  const [header, claims, signature] = token.split(".") as [string, string, string];

  return { header: decoded(header), claims: decoded(claims), signingInput: Buffer.from(`${header}.${claims}`), signature: Buffer.from(signature, "base64url") };
}

function decoded(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString()) as Record<string, unknown>;
}
