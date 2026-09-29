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

/** The definition's environment, under the floor's identity for a visit that may write to a repository. What the definition sets wins. */
export function environmentOf(needs: readonly BriefNeed[], defined: Record<string, string> | undefined): Record<string, string> | undefined {
  const writes = needs.some((need) => need.kind === "git" && need.access === "write");

  return writes ? { ...FLOOR_IDENTITY, ...defined } : defined;
}
