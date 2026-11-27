// The keys behind the gateway token (gateway-token.ts): one Ed25519 private key the floor signs with, and the public keys it signed with before, which a verifier still needs until the tokens they signed have expired. Read once at startup from the environment; a floor with neither signs nothing and publishes an empty key set.
import { createHash, createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";

export const SIGNING_KEY_ENV = "FLOOR_GATEWAY_SIGNING_KEY";
export const RETIRED_KEYS_ENV = "FLOOR_GATEWAY_RETIRED_KEYS";

const ED25519_PUBLIC_KEY_BYTES = 32;

/** One public key as the key set publishes it. It has no `d` member: this type is the only shape that reaches the wire. */
export interface PublishedKey {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  kid: string;
  use: "sig";
  alg: "EdDSA";
}

export interface SigningKey {
  kid: string;
  privateKey: KeyObject;
}

export interface GatewayKeys {
  /** Null on a floor that signs no gateway token. */
  signing: SigningKey | null;
  /** The signing key's public part first, then the retired ones. */
  published: PublishedKey[];
}

export function loadGatewayKeys(env: NodeJS.ProcessEnv): GatewayKeys {
  const signing = env[SIGNING_KEY_ENV] ? signingKeyOf(env[SIGNING_KEY_ENV]) : null;
  const retired = env[RETIRED_KEYS_ENV] ? retiredKeysOf(env[RETIRED_KEYS_ENV]) : [];
  const own = signing ? [publishedOf(signing.publicPart)] : [];

  return {
    signing: signing && { kid: thumbprintOf(signing.publicPart), privateKey: signing.privateKey },
    published: [...own, ...retired.filter((key) => !own.some((mine) => mine.kid === key.kid))],
  };
}

/** RFC 7638: the SHA-256 of the key's required members, in lexicographic order and with no whitespace, as base64url. `publicPart` is the JWK's `x`. */
export function thumbprintOf(publicPart: string): string {
  return createHash("sha256").update(`{"crv":"Ed25519","kty":"OKP","x":"${publicPart}"}`).digest("base64url");
}

// What went wrong is never quoted: the value is a private key.
function signingKeyOf(pem: string): { privateKey: KeyObject; publicPart: string } {
  const privateKey = parsedPrivateKey(pem);

  if (privateKey?.asymmetricKeyType !== "ed25519") throw new Error(`${SIGNING_KEY_ENV} must be an Ed25519 private key, as PKCS#8 PEM`);
  const jwk = createPublicKey(privateKey).export({ format: "jwk" });

  return { privateKey, publicPart: jwk.x! };
}

function parsedPrivateKey(pem: string): KeyObject | null {
  try {
    return createPrivateKey({ key: pem, format: "pem" });
  } catch {
    return null;
  }
}

function retiredKeysOf(json: string): PublishedKey[] {
  const listed = parsedJson(json);

  if (!Array.isArray(listed)) throw new Error(`${RETIRED_KEYS_ENV} must be a JSON array of public Ed25519 keys, each a JWK`);

  return listed.map((entry: unknown, position) => publishedOf(publicPartOf(entry, position)));
}

function parsedJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function publicPartOf(entry: unknown, position: number): string {
  const jwk = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;

  if ("d" in jwk) throw new Error(`${RETIRED_KEYS_ENV}: entry ${position} carries a private member "d"; list the public key alone`);
  if (!isEd25519(jwk) || !isPublicPart(jwk.x)) throw new Error(`${RETIRED_KEYS_ENV}: entry ${position} is not a public Ed25519 key (a JWK with kty "OKP", crv "Ed25519" and x)`);

  return jwk.x;
}

function isEd25519(jwk: Record<string, unknown>): boolean {
  return jwk.kty === "OKP" && jwk.crv === "Ed25519";
}

function isPublicPart(given: unknown): given is string {
  return typeof given === "string" && /^[A-Za-z0-9_-]+$/.test(given) && Buffer.from(given, "base64url").length === ED25519_PUBLIC_KEY_BYTES;
}

function publishedOf(publicPart: string): PublishedKey {
  return { kty: "OKP", crv: "Ed25519", "x": publicPart, kid: thumbprintOf(publicPart), use: "sig", alg: "EdDSA" };
}
