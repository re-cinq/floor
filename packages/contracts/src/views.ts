// A row, declared once and read two ways: `Time` is a Date in the store that keeps it and an ISO string on the wire, which is the only difference between them.
import type { AgentSettings, Brief, Item, Report } from "./definitions.js";

export interface RunFields<Time> {
  id: string;
  lineId: string;
  lineHash: string;
  repo: string | null;
  subjectKey: string | null;
  startItems: Record<string, Item>;
  outcome: string | null;
  reason: string | null;
  createdAt: Time;
  finishedAt: Time | null;
}

export interface VisitFields<Time> {
  id: string;
  runId: string;
  nodeId: string;
  iteration: number;
  stationHash: string | null;
  agentDefinitionHash: string | null;
  brief: Brief;
  report: Report | null;
  worker: string | null;
  requestedBy: string | null;
  /** Which item of a fan-out this visit is the body for; null on an ordinary visit. */
  branch: number | null;
  deadline: Time | null;
  /** The previous visit's sessionRef, for an executor restoring a conversation. Beyond the public Brief a station author sees: this is the executor's own lookup, resolved once so it is not repeated. */
  resumedFrom: string | null;
  /** The resolved agent settings bundle, for an executor building the CR. */
  agentSettings: AgentSettings | null;
}

export interface FloorEventFields<Time> {
  id: string;
  name: string;
  payload: unknown;
  dedupeKey: string | null;
  tags: string[];
  runId: string | null;
  availableAt: Time;
  createdAt: Time;
  claimedAt: Time | null;
  claimedBy: string | null;
  ackedAt: Time | null;
  attempts: number;
  lastError: string | null;
  deadAt: Time | null;
  droppedAt: Time | null;
}

/** `produced` and `session` are the sink's own notes on a visit still running; only the first three may be posted. */
export type RecordKind = "log" | "turn" | "llm_call" | "produced" | "session";

export interface StationRunRecordFields<Time> {
  visitId: string;
  kind: RecordKind;
  seq: number;
  body: unknown;
  occurredAt: Time;
}

export interface DefinitionRowFields<Body, Time> {
  kind: string;
  id: string;
  hash: string;
  body: Body;
  archivedAt: Time | null;
  createdBy: string | null;
  createdAt: Time;
}

export interface CostsRow {
  key: string | null;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  /** Grouped by model, a visit is counted under each model it called. */
  visits: number;
  visitsMissingCost: number;
  /** The models that counted tokens in these visits and had no price stated, so their part is not in the cost. */
  unpriced: string[];
}

export type RunView = RunFields<string>;
export type VisitView = VisitFields<string>;
export type FloorEventView = FloorEventFields<string>;
export type StationRunRecordView = StationRunRecordFields<string>;
export type DefinitionRowView<Body> = DefinitionRowFields<Body, string>;

/** One frame of `GET /assembly-runs/:id/live`. Every frame but `unsupported` carries the `seq` to come back with. */
export type LiveFrame =
  | { type: "record"; seq: number; visitId: string; nodeId: string; iteration: number; record: StationRunRecordView }
  | { type: "visit_opened" | "visit_reported"; seq: number; visit: VisitView }
  | { type: "run_settled" | "run_reopened"; seq: number; run: RunView }
  | { type: "caught_up"; seq: number }
  | { type: "unsupported" };

/** One frame of `GET /assembly-runs/live`: ids only, the reader reads what they name; `resync` is the first frame of every connection and follows any gap. */
export type FloorFrame = { type: "run_started"; runId: string } | { type: "run_changed"; runId: string } | { type: "resync" };
