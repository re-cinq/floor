// The entries of a test run's timeline: what happened in the run, and when.
import type { VisitKind } from "./visit-kind.js";

export type TimelineEntry =
  | { at: string; type: "run_started"; line: string }
  | { at: string; type: "visit_opened"; visit: string; node: string; iteration: number; mode: "local" | "simulated" }
  | { at: string; type: "visit_reported"; visit: string; outcome: string }
  | { at: string; type: "run_settled"; outcome: string };

export function modeOf(kind: VisitKind): "local" | "simulated" {
  return kind === "agent" ? "local" : "simulated";
}
