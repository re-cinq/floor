// What a pod is told that no agent definition should have to say: it is true of every pod of its kind, on every cluster.
import { identityFor } from "./git-identity.js";
import type { BriefNeed } from "./need.js";

/** Gemini's CLI works only in a folder it was told to trust, and with nobody at a terminal to ask, it stops. A pod's workspace is made for the visit and holds what the visit was given. */
const TRUSTING = { GEMINI_CLI_TRUST_WORKSPACE: "true" };

export interface Visiting {
  needs: readonly BriefNeed[];
  model?: string;
  /** The agent definition's own environment, which wins over what is told here. */
  defined?: Record<string, string>;
}

export function environmentOf(visiting: Visiting): Record<string, string> | undefined {
  const trusting = visiting.model?.startsWith("gemini") ? TRUSTING : {};
  const told = { ...identityFor(visiting.needs), ...trusting, ...visiting.defined };

  return Object.keys(told).length > 0 ? told : undefined;
}
