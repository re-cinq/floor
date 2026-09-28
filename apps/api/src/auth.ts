// Bearer auth (docs/api_sketch.md, "Auth"): the one configured service token, or a visit token scoped to the visit it names. Human sessions are not yet implemented.
import type { Server } from "@hapi/hapi";
import Boom from "@hapi/boom";
import { verifyVisitToken } from "./visit-token.js";

export type Credentials = { kind: "service" } | { kind: "visit"; visitId: string };

export function registerAuth(server: Server, deps: { serviceToken: string; visitTokenSecret: string; now: () => Date }): void {
  server.auth.scheme("bearer", () => ({
    authenticate(request, toolkit) {
      const header: unknown = request.headers.authorization;
      const token = bearerToken(typeof header === "string" ? header : undefined);

      if (!token) return toolkit.unauthenticated(unauthorized());
      const credentials = credentialsFor(token, deps);

      if (!credentials) return toolkit.unauthenticated(unauthorized());

      return toolkit.authenticated({ credentials });
    },
  }));
  server.auth.strategy("bearer", "bearer");
  server.auth.default("bearer");
}

function credentialsFor(token: string, deps: { serviceToken: string; visitTokenSecret: string; now: () => Date }): Credentials | null {
  if (token === deps.serviceToken) return { kind: "service" };
  const verified = verifyVisitToken(token, deps.visitTokenSecret, deps.now());

  return verified ? { kind: "visit", visitId: verified.visitId } : null;
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
