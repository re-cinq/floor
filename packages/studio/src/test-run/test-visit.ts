// A visit of a local test run, and the run itself: its line, its start items and the visits so far.
import type { Item, Report } from "@re-cinq/floor-contracts";
import type { TestLine } from "./test-line.js";
import type { VisitKind } from "./visit-kind.js";

export interface TestVisit {
  id: string;
  nodeId: string;
  iteration: number;
  station: string | null;
  report: Report | null;
}

export interface VisitState extends TestVisit {
  kind: VisitKind;
  needs: Record<string, string>;
  report: Report | null;
  openedAt: string;
  reportedAt?: string;
  agentDurationMs?: number;
  costUsd?: number;
}

export interface TestRun {
  line: TestLine;
  startItems: Record<string, Item>;
  visits: readonly TestVisit[];
}
