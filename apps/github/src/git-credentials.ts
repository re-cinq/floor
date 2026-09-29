// The floor's git credential provider: the floor asks, as a service, for a token for one repository with read or write access, and gets one minted now, good for that repository's contents and nothing else.
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Repository, ScopedTokenFor } from "./github-auth.js";
import { headerOf, jsonOf, type Route } from "./http.js";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const GITHUB = "github.com";
export const GIT_CREDENTIALS_PATH = "/git-credentials";

const asked = z.object({ repoUrl: z.string(), access: z.enum(["read", "write"]) });

export interface GitCredentialDeps {
  serviceToken: string;
  mint: ScopedTokenFor;
}

export function gitCredentialRoute(deps: GitCredentialDeps): Route {
  return async (request, body) => {
    if (!isBearer(headerOf(request, "authorization"), deps.serviceToken)) return { status: HTTP_UNAUTHORIZED };
    const asking = asked.safeParse(jsonOf(body));

    if (!asking.success) return { status: HTTP_BAD_REQUEST, body: { error: "expected a repoUrl and an access of read or write" } };
    const repository = repositoryAt(asking.data.repoUrl);

    if (!repository) return { status: HTTP_NOT_FOUND, body: { error: `"${asking.data.repoUrl}" is not a repository on ${GITHUB}` } };

    return { status: HTTP_OK, body: { username: "x-access-token", password: await deps.mint(repository, asking.data.access) } };
  };
}

// Compared as digests, so neither the length of the token nor how much of it matched is told by how long this took.
function isBearer(authorization: string | undefined, token: string): boolean {
  return timingSafeEqual(digestOf(authorization ?? ""), digestOf(`Bearer ${token}`));
}

function digestOf(text: string): Buffer {
  return createHash("sha256").update(text).digest();
}

const CLONE_URL = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/;

/** `https://github.com/owner/name`, with or without `.git`, and nothing deeper. */
export function repositoryAt(repoUrl: string): Repository | null {
  const [, owner, name] = CLONE_URL.exec(repoUrl) ?? [];

  return owner && name ? { owner, name } : null;
}
