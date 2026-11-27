// The entries of a test run's timeline: what happened in the run, and when.
import type { Payload } from "@re-cinq/floor-assembly-lines";
import type { VisitKind } from "./visit-kind.js";

/** Whether the visit ran a real agent here or a person stood in for it. */
export type VisitMode = "local" | "simulated";

export type TimelineEntry =
  | { at: string; type: "run_started"; line: string }
  | { at: string; type: "visit_opened"; visit: string; node: string; iteration: number; mode: VisitMode }
  | { at: string; type: "visit_reported"; visit: string; outcome: string }
  | { at: string; type: "event_received"; event: string; payload: Payload; answered: string[] }
  | { at: string; type: "run_settled"; outcome: string };

export function modeOf(kind: VisitKind): VisitMode {
  return kind === "agent" ? "local" : "simulated";
}
