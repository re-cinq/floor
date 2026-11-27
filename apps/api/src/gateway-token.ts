// The gateway token: what one visit's agent presents to a service outside the floor, an MCP server its definition names. A JWT signed with the floor's Ed25519 key, so the service verifies it with the floor's published key set (routes/well-known.ts) and shares no secret with the floor. It is not the visit token (visit-token.ts), and the floor's own routes do not take it.
import { sign } from "node:crypto";
import { Refusal, enforce } from "@floor/store";
import type { SigningKey } from "./gateway-keys.js";

const MS_PER_SECOND = 1000;
const LONGEST_LIFE_SECONDS = 86_400;
const REPO_PARTS = 3;

export interface GatewayTokenAsk {
  /** The floor's own address, as its configuration says it. */
  issuer: string;
  /** Who the token is for: a verifier accepts only a token that names it. */
  audience: string;
  visitId: string;
  runId: string;
  /** The run's repository, `host/owner/name`. */
  repo: string | null;
  scopes: string[];
  deadline: Date;
  now: Date;
}

/** A compact JWS. Refuses a token that would live longer than a day, one already expired, and a run with no repository to name. */
export function mintGatewayToken(ask: GatewayTokenAsk, key: SigningKey): string {
  const iat = Math.floor(ask.now.getTime() / MS_PER_SECOND);
  const exp = Math.floor(ask.deadline.getTime() / MS_PER_SECOND);

  enforce(exp > iat, "a gateway token cannot be signed for a visit whose deadline has passed");
  enforce(exp - iat <= LONGEST_LIFE_SECONDS, "a gateway token cannot be signed for a visit whose deadline is more than 24 hours away");
  const claims = { iss: ask.issuer, aud: ask.audience, sub: ask.visitId, run: ask.runId, repo: repoClaim(ask.repo), scope: ask.scopes.join(" "), iat, exp };
  const signingInput = `${encoded({ alg: "EdDSA", typ: "JWT", kid: key.kid })}.${encoded(claims)}`;

  return `${signingInput}.${sign(null, Buffer.from(signingInput), key.privateKey).toString("base64url")}`;
}

function repoClaim(repo: string | null): string {
  const named = repo?.toLowerCase() ?? "";
  const parts = named.split("/");

  if (parts.length !== REPO_PARTS || parts.some((part) => part === "")) throw new Refusal(`a gateway token names the run's repository as host/owner/name, and this run's is "${named}"`);

  return named;
}

function encoded(part: object): string {
  return Buffer.from(JSON.stringify(part)).toString("base64url");
}
