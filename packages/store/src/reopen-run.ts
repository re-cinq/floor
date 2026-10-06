// A start by hand on a finished run (docs/decisions.md, "A start by hand reopens a finished run"): the run keeps its bag and its history, and what its settling left open is closed so the walk does not wait on it.
import postgres, { type PoolClient } from "pg";
import type { EventStore } from "./events.js";
import { Refusal } from "./refusal.js";
import type { Queryable } from "./rows.js";
import { aboutRun } from "./run-args.js";
import { closeOpenVisits, openRunBySubject, reopenRun } from "./sql.js";
import type { Run } from "./types.js";

export interface HandStart {
  runId: string;
  requestedBy: string;
  now: Date;
  events: EventStore;
}

/** Before a start by hand opens its node: an open run has its human visits closed; a finished run is reopened and has every open visit closed. */
export async function clearTheWayByHand(client: PoolClient, start: HandStart): Promise<void> {
  const reopened = await reopenRun(client, start.runId);

  await closeOpenVisits(client, { runId: start.runId, now: start.now, humanOnly: !reopened });
  if (!reopened) return;

  await start.events.enqueue({ name: "internal.run.reopened", payload: { ...aboutRun(reopened), requestedBy: start.requestedBy }, runId: start.runId });
}

/** The subject index keeps one open run per subject, so a run reopened beside another is refused, naming that one. Any other error is the caller's. */
export async function refuseBesideOpenRun(connection: Queryable, run: Run, error: unknown): Promise<never> {
  const other = isSubjectTaken(error) ? await openRunBySubject(connection, run.repo, run.subjectKey!) : null;

  if (!other) throw error;
  throw new Refusal(`run "${run.id}" cannot reopen: run "${other.id}" is open on its subject "${run.subjectKey}"`);
}

function isSubjectTaken(error: unknown): boolean {
  return error instanceof postgres.DatabaseError && error.constraint === "assembly_runs_subject_open";
}
