// Who a pod's commits are by. git refuses to commit for nobody, and a pod is nobody until it is told; an agent left to name itself names itself anything.
import type { BriefNeed } from "./need.js";

const NAME = "Floor Agent";
const ADDRESS = "floor-agent@re-cinq.com";

/** git's own variables, which it reads before any config. */
const FLOOR_IDENTITY: Record<string, string> = {
  GIT_AUTHOR_NAME: NAME,
  GIT_AUTHOR_EMAIL: ADDRESS,
  GIT_COMMITTER_NAME: NAME,
  GIT_COMMITTER_EMAIL: ADDRESS,
};

/** The floor's identity for a visit that may write to a repository, and nothing for one that only reads. */
export function identityFor(needs: readonly BriefNeed[]): Record<string, string> {
  const writes = needs.some((need) => need.kind === "git" && need.access === "write");

  return writes ? FLOOR_IDENTITY : {};
}
