// The state of a local test run that goes to the page: where it is, how it ended and the visits so far.
import type { StandInAction } from "./stand-in-actions.js";
import type { VisitState } from "./test-visit.js";

export interface TestRunState {
  folder: string;
  lineId: string;
  status: "running" | "waiting" | "settled" | "stopped";
  ending?: TestRunEnding;
  visits: VisitState[];
  actions: Record<string, StandInAction[]>;
}

export interface TestRunListing {
  run: string;
  line: string;
  folder: string;
  status: TestRunState["status"];
  startedAt: string;
  ending?: TestRunEnding;
}

export interface TestRunEnding {
  outcome: "finished" | "iteration_max" | "error" | "failed" | "cancelled";
  reason?: string;
}
