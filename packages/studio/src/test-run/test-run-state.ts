// The state of a local test run that goes to the page: where it is, how it ended and the visits so far.
import type { VisitState } from "./test-visit.js";

export interface TestRunState {
  folder: string;
  lineId: string;
  status: "running" | "waiting" | "settled";
  ending?: TestRunEnding;
  visits: VisitState[];
}

export interface TestRunEnding {
  outcome: "finished" | "iteration_max" | "error" | "failed" | "cancelled";
  reason?: string;
}
