// The need/produce shapes shared between the brief the Floor sends (floor-client.ts) and the CR triple built from it (agent-triple.ts), so the two never drift apart under separate declarations.

export interface ValueNeed {
  name: string;
  kind: "value";
  value: string;
}

export interface FileNeed {
  name: string;
  kind: "file";
  path: string;
  url: string;
}

/** The wire shape a `DispatchBriefResponse` carries: the Floor states intent (`access`), not a credential. */
export interface GitNeedRaw {
  name: string;
  kind: "git";
  path: string;
  repoUrl: string;
  ref: string;
  access: "read" | "write";
}

/** The shape the CR builder consumes: a write need has already been exchanged for a `tokenSecret` by the claim loop. */
export interface GitNeedResolved {
  name: string;
  kind: "git";
  path: string;
  repoUrl: string;
  ref: string;
  tokenSecret?: string;
}

export type BriefNeed = ValueNeed | FileNeed | GitNeedRaw;

export interface Produce {
  name: string;
  kind: "value" | "file";
  /** File produces only: where the agent leaves it, relative to the workspace. */
  path?: string;
}
