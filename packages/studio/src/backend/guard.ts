// Who may open the socket. The backend writes files and starts processes, so no web page may reach it: the launch token keeps out a program that was not told it, the Origin check a page in the person's browser that guessed the port.
import { createHash, timingSafeEqual } from "node:crypto";

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;

export interface UpgradeAsked {
  url: string | undefined;
  origin: string | undefined;
  token: string;
  origins: readonly string[];
}

export interface UpgradeRefusal {
  status: typeof UNAUTHORIZED | typeof FORBIDDEN;
  reason: string;
}

export function upgradeRefusal({ url, origin, token, origins }: UpgradeAsked): UpgradeRefusal | undefined {
  // A client that is no browser sends no Origin; a browser always does, and its page must be one the shell served.
  if (origin !== undefined && !origins.includes(origin)) return { status: FORBIDDEN, reason: "a page of another origin may not use this socket" };
  if (!isSameToken(tokenOf(url), token)) return { status: UNAUTHORIZED, reason: "the socket needs the launch token" };

  return undefined;
}

function tokenOf(url: string | undefined): string {
  return new URL(url ?? "/", "http://localhost").searchParams.get("token") ?? "";
}

// Hashed first so the two buffers are as long as each other: timingSafeEqual throws on unequal lengths, and a length is a clue.
function isSameToken(given: string, token: string): boolean {
  return timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(token).digest());
}
