// The visit token (docs/api_sketch.md, "Auth"): scoped to one visit, expiring at its deadline. An HMAC over `visitId.expiryEpochSeconds`, not a database lookup, so verifying it never costs a query.

import { createHmac, timingSafeEqual } from "node:crypto";

const MS_PER_SECOND = 1000;
const TOKEN_PART_COUNT = 3;

export function mintVisitToken(visitId: string, deadline: Date, secret: string): string {
  const expiry = Math.floor(deadline.getTime() / MS_PER_SECOND);
  const payload = `${visitId}.${expiry}`;

  return `${payload}.${sign(payload, secret)}`;
}

export interface VerifiedVisitToken {
  visitId: string;
  expiry: Date;
}

export function verifyVisitToken(token: string, secret: string, now: Date): VerifiedVisitToken | null {
  const parts = token.split(".");

  if (parts.length !== TOKEN_PART_COUNT) return null;
  const [visitId, expirySeconds, signature] = parts as [string, string, string];
  const payload = `${visitId}.${expirySeconds}`;

  if (!signaturesMatch(sign(payload, secret), signature)) return null;
  const expiry = new Date(Number(expirySeconds) * MS_PER_SECOND);

  if (expiry.getTime() < now.getTime()) return null;

  return { visitId, expiry };
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function signaturesMatch(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
