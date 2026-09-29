// Bearer auth (docs/api_sketch.md, "Auth"): the one configured service token, or a visit token scoped to the visit it names. Human sessions are not yet implemented.
import { createHash, timingSafeEqual } from "node:crypto";
import type { Server } from "@hapi/hapi";
import Boom from "@hapi/boom";
import { verifyVisitToken } from "./visit-token.js";

/** `scope` is what hapi reads to decide which routes a caller reaches; `kind` is what a handler reads to decide which visit. */
export type Credentials = ({ kind: "service" } | { kind: "visit"; visitId: string }) & { scope: string[] };

const SERVICE = "service";
const VISIT = "visit";

/** For a route a visit reaches with its own token. Every route that does not say this is a service's alone: a visit's token is held by an agent in a pod, and a route added tomorrow is closed to it without anyone remembering to close it. */
export const VISITS_TOO = { scope: [SERVICE, VISIT] };

export interface AuthDeps {
  serviceToken: string;
  visitTokenSecret: string;
  now: () => Date;
}

export function registerAuth(server: Server, deps: AuthDeps): void {
  server.auth.scheme("bearer", () => ({
    authenticate(request, toolkit) {
      const header: unknown = request.headers.authorization;
      const credentials = callerOf(typeof header === "string" ? header : undefined, deps);

      if (!credentials) return toolkit.unauthenticated(unauthorized());

      return toolkit.authenticated({ credentials });
    },
  }));
  server.auth.strategy("bearer", "bearer");
  server.auth.default({ strategy: "bearer", scope: [SERVICE] });
}

/** Who an authorization header names, or null when it names nobody. Exported for what hapi's own auth never sees: a socket's upgrade. */
export function callerOf(header: string | undefined, deps: AuthDeps): Credentials | null {
  const token = bearerToken(header);

  return token ? credentialsFor(token, deps) : null;
}

function credentialsFor(token: string, deps: AuthDeps): Credentials | null {
  if (isToken(token, deps.serviceToken)) return { kind: "service", scope: [SERVICE] };
  const verified = verifyVisitToken(token, deps.visitTokenSecret, deps.now());

  return verified ? { kind: "visit", visitId: verified.visitId, scope: [VISIT] } : null;
}

// Compared as digests, so neither the token's length nor how much of it matched is told by how long this took.
function isToken(given: string, expected: string): boolean {
  return timingSafeEqual(digestOf(given), digestOf(expected));
}

function digestOf(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;

  return header.slice("Bearer ".length);
}

function unauthorized(): Error {
  return Boom.unauthorized("missing or invalid bearer token");
}

/** Why this caller may not touch this visit, or null when it may: a service may touch any, a visit token only its own. */
export function refusalForVisit(credentials: Credentials, visitId: string): string | null {
  if (credentials.kind !== "visit") return null;

  return credentials.visitId === visitId ? null : "a visit token may only touch its own visit";
}
