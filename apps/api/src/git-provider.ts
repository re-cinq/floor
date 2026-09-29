// The floor holds no provider's client. It asks the one it was configured with, over HTTP, as a service: which repository, and how much access.
import { z } from "zod";
import type { GitNeed } from "./git-grant.js";

/** Under the thirty seconds the pod's credential helper waits for the floor. */
const REQUEST_TIMEOUT_MS = 20_000;

const gitCredential = z.object({ username: z.string().min(1), password: z.string().min(1) });

export type GitCredential = z.infer<typeof gitCredential>;

export interface GitProvider {
  url: string;
  token: string;
}

/** Null for a provider that refused, or answered with something that is not a credential. */
export async function askProvider(provider: GitProvider, need: GitNeed): Promise<GitCredential | null> {
  const response = await fetch(provider.url, {
    method: "POST",
    headers: { authorization: `Bearer ${provider.token}`, "content-type": "application/json" },
    body: JSON.stringify({ repoUrl: need.repoUrl, access: need.access }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const answered = gitCredential.safeParse(response.ok ? await response.json() : null);

  return answered.success ? answered.data : null;
}
