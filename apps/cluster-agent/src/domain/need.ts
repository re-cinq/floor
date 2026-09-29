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

/** The floor states intent (`access`), never a credential: git asks the floor for one when it needs it. */
export interface GitNeed {
  name: string;
  kind: "git";
  path: string;
  repoUrl: string;
  ref: string;
  access: "read" | "write";
}

export type BriefNeed = ValueNeed | FileNeed | GitNeed;

export interface Produce {
  name: string;
  kind: "value" | "file";
  /** File produces only: where the agent leaves it, relative to the workspace. */
  path?: string;
}
