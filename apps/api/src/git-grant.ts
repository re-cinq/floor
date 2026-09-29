// Which of a visit's git needs a pod is asking about. It asks by `owner/name`, as the subsystem's credential helper does, and is granted no more than the need declares.
import { canonicalRepo, type DispatchNeed } from "@floor/store";

export type GitNeed = Extract<DispatchNeed, { kind: "git" }>;

/** The widest of the visit's needs for that repository: one station may read a repository under one name and write it under another. */
export function gitNeedFor(needs: DispatchNeed[], repo: string): GitNeed | undefined {
  const named = needs.filter((need): need is GitNeed => need.kind === "git" && slugOf(need.repoUrl) === canonicalRepo(repo));

  return named.find((need) => need.access === "write") ?? named[0];
}

export function declaresWrite(needs: DispatchNeed[]): boolean {
  return needs.some((need) => need.kind === "git" && need.access === "write");
}

function slugOf(repoUrl: string): string {
  const path = URL.canParse(repoUrl) ? new URL(repoUrl).pathname : "";

  return canonicalRepo(path.replace(/^\//, "").replace(/\.git$/, ""));
}
