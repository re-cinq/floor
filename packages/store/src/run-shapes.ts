// What a run is started with and listed by, and what comes back: the plain shapes the store and its SQL share.

import type { Item, Run } from "./types.js";

export interface StartRunInput {
  lineId: string;
  repo: string | null;
  startItems: Record<string, Item>;
  /** Starts at a node other than the line's entry; the node must exist. */
  entry?: string;
  /** Pins a version of the line; absent means the latest. */
  lineHash?: string;
}

export interface StartResult {
  run: Run;
  joined: boolean;
}

export interface RunFilter {
  lineId?: string;
  /** `null` asks for the runs that have no repo. */
  repo?: string | null;
  subjectKey?: string;
  open?: boolean;
  /** A floor on when the run was created. */
  since?: Date;
}

export interface Page {
  limit: number;
  cursor?: string;
}

export interface PageOf<T> {
  items: T[];
  nextCursor: string | null;
}
