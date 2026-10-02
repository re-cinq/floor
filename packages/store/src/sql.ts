// The mutations and list query behind the store: one statement each, plus the compare-and-set report write.

import { canonicalItems, canonicalRepoOrNull } from "./repo-name.js";
import type { PoolClient } from "pg";
import { Refusal, enforce } from "./refusal.js";
import { decodeRunCursor, type RunPosition } from "./run-cursor.js";
import { addCondition, addRepoCondition, toRun, toVisit, type Queryable, type StationRunRow } from "./rows.js";
import type { Report, Run, Visit } from "./types.js";
import type { OpenContext } from "./open-visit.js";
import type { Page, RunFilter, StartRunInput } from "./run-shapes.js";

export async function insertRun(
  client: PoolClient,
  input: StartRunInput,
  lineHash: string,
  subjectKey: string | null,
): Promise<Run | null> {
  const { rows } = await client.query(
    `insert into assembly_runs (id, line_id, line_hash, repo, subject_key, start_items)
     values (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb)
     on conflict (repo, subject_key) where subject_key is not null and finished_at is null do nothing
     returning *`,
    [input.lineId, lineHash, canonicalRepoOrNull(input.repo), subjectKey, JSON.stringify(canonicalItems(input.startItems))],
  );

  return rows[0] ? toRun(rows[0]) : null;
}

export async function openRunBySubject(client: Queryable, repo: string | null, subjectKey: string): Promise<Run | null> {
  const { rows } = await client.query(
    `select * from assembly_runs where repo is not distinct from $1 and subject_key = $2 and finished_at is null`,
    [canonicalRepoOrNull(repo), subjectKey],
  );

  return rows[0] ? toRun(rows[0]) : null;
}

export interface SettleInput {
  runId: string;
  outcome: string;
  reason: string | null;
  now: Date;
}

export async function settleRun(client: PoolClient, settle: SettleInput): Promise<Run> {
  const { rows } = await client.query(
    `update assembly_runs set outcome = $2, reason = $3, finished_at = $4
     where id = $1 and finished_at is null
     returning *`,
    [settle.runId, settle.outcome, settle.reason, settle.now],
  );

  enforce(rows[0], `run "${settle.runId}" is already finished`);
  const settled = toRun(rows[0]);

  console.log(`floor store: run ${settled.id} settled as ${settled.outcome}`);

  return settled;
}

export interface OpenVisitRow {
  stationRunId: string;
  dispatchTags: string[];
}

export async function openVisitRows(client: PoolClient, runId: string): Promise<OpenVisitRow[]> {
  const { rows } = await client.query(
    `select station_run_id, input from station_runs where assembly_run_id = $1 and report is null`,
    [runId],
  );

  return rows.map(toOpenVisitRow);
}

// snake_case mirrors Postgres's own column name verbatim, a third-party shape rather than ours to rename.
/* eslint-disable @typescript-eslint/naming-convention */
function toOpenVisitRow(row: { station_run_id: string; input: { dispatchTags?: string[] } }): OpenVisitRow {
  return { stationRunId: row.station_run_id, dispatchTags: row.input.dispatchTags ?? [] };
}
/* eslint-enable @typescript-eslint/naming-convention */

/** The node of the run's most recently opened open visit; with none open, of the last visit opened; null with no visits. */
export async function currentNodeOf(connection: Queryable, runId: string): Promise<string | null> {
  const { rows } = await connection.query(
    `select node_id from station_runs where assembly_run_id = $1 order by (report is null) desc, id desc limit 1`,
    [runId],
  );

  return rows[0]?.node_id ?? null;
}

export async function insertVisit(client: PoolClient, runId: string, context: OpenContext): Promise<{ visit: Visit; created: boolean }> {
  const input = {
    brief: context.brief,
    agentSettings: context.agentSettings,
    resumedFrom: context.resumedFrom,
    dispatchTags: context.dispatchTags,
  };

  const { rows } = await client.query(
    `insert into station_runs (station_run_id, assembly_run_id, node_id, iteration, station_hash, agent_definition_hash, input, requested_by, deadline)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     on conflict (assembly_run_id, node_id, iteration) do update set input = station_runs.input
     returning *, (xmax = 0) as created`,
    [
      runId,
      context.nodeId,
      context.iteration,
      context.stationHash,
      context.agentDefinitionHash,
      JSON.stringify(input),
      context.requestedBy,
      context.deadline,
    ],
  );
  const row = rows[0] as StationRunRow & { created: boolean };

  return { visit: toVisit(row), created: row.created };
}

export interface WriteReportInput {
  visitId: string;
  report: Report;
  worker?: string;
  now: Date;
}

export async function writeReport(client: PoolClient, write: WriteReportInput): Promise<Visit> {
  const { rows } = await client.query(
    `update station_runs set report = coalesce(report, $2::jsonb), worker = coalesce(worker, $3), finished_at = coalesce(finished_at, $4)
     where station_run_id = $1
     returning *`,
    [write.visitId, JSON.stringify(write.report), write.worker ?? null, write.now],
  );

  enforce(rows[0], `no visit "${write.visitId}"`);
  const stored = rows[0] as StationRunRow;

  requireEqualReport(write.visitId, stored.report as Report, write.report);
  const visit = toVisit(stored);

  console.log(`floor store: visit ${visit.id} reported ${visit.report?.outcome}`);

  return visit;
}

// Structural, not JSON.stringify: Postgres's jsonb does not preserve key insertion order, so two semantically equal reports can round-trip with their keys in a different order.
function requireEqualReport(visitId: string, stored: Report, attempted: Report): void {
  if (deepEqual(stored, attempted)) return;
  throw new Refusal(`visit "${visitId}" already has a different report`);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => deepEqual(left[key], right[key]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function listQuery(filter: RunFilter, page: Page): { text: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];

  addCondition(conditions, values, "line_id = $%", filter.lineId);
  addRepoCondition(conditions, values, "repo", filter.repo);
  addCondition(conditions, values, "subject_key = $%", filter.subjectKey);
  addCondition(conditions, values, "created_at >= $%", filter.since);
  if (filter.open !== undefined) conditions.push(filter.open ? "finished_at is null" : "finished_at is not null");
  if (page.cursor) conditions.push(afterCursor(values, decodeRunCursor(page.cursor)));
  values.push(page.limit);

  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

  return { text: `select *, created_at::text as cursor_created_at from assembly_runs ${where} order by created_at desc, id desc limit $${values.length}`, values };
}

function afterCursor(values: unknown[], position: RunPosition): string {
  values.push(position.createdAt, position.id);

  return `(created_at, id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`;
}

/** Which of these hashes the blobs table actually holds, for a line's `files` to be checked against before a run starts on them. */
export async function blobHashesExist(client: Queryable, hashes: string[]): Promise<Set<string>> {
  if (hashes.length === 0) return new Set();
  const { rows } = await client.query(`select hash from blobs where hash = any($1::text[])`, [hashes]);

  return new Set(rows.map((row: { hash: string }) => row.hash));
}

/** A start from outside closes the run's open human visits first, so the kernel's replay never sees a person's node left open behind the one a person just started. No walk advance: the visit opened next is what moves the run. */
export async function closeOpenHumanVisits(client: PoolClient, runId: string, now: Date): Promise<void> {
  await client.query(
    `update station_runs set report = '{"outcome":"cancelled"}'::jsonb, finished_at = $2
     where assembly_run_id = $1 and report is null
       and station_hash in (select hash from definitions where kind = 'station' and body->>'kind' = 'human')`,
    [runId, now],
  );
}

/** Every open visit whose deadline has passed; a human visit's deadline is null, so it never matches. */
export async function overdueVisitRows(client: Queryable, now: Date): Promise<Visit[]> {
  const { rows } = await client.query(`select * from station_runs where report is null and deadline < $1`, [now]);

  return rows.map(toVisit);
}

export interface OutcomeCount {
  outcome: string;
  count: number;
}

export interface RunMetrics {
  openRuns: number;
  settledByOutcome: OutcomeCount[];
  openVisits: number;
  overdueVisits: number;
}

/** For GET /metrics (docs/api_sketch.md, "Metrics"): every number counted fresh from assembly_runs/station_runs, in parallel, on every scrape — never a per-process counter. */
export async function runMetricsSnapshot(client: Queryable, now: Date): Promise<RunMetrics> {
  const [openRuns, settledByOutcome, openVisits, overdueVisits] = await Promise.all([
    openRunCount(client),
    settledRunCounts(client),
    openVisitCount(client),
    overdueVisitCount(client, now),
  ]);

  return { openRuns, settledByOutcome, openVisits, overdueVisits };
}

function openRunCount(client: Queryable): Promise<number> {
  return countOf(client, `select count(*) as count from assembly_runs where finished_at is null`);
}

async function settledRunCounts(client: Queryable): Promise<OutcomeCount[]> {
  const { rows } = await client.query<{ outcome: string; count: string }>(
    `select outcome, count(*) as count from assembly_runs where outcome is not null group by outcome`,
  );

  return rows.map((row) => ({ outcome: row.outcome, count: Number(row.count) }));
}

function openVisitCount(client: Queryable): Promise<number> {
  return countOf(client, `select count(*) as count from station_runs where report is null`);
}

function overdueVisitCount(client: Queryable, now: Date): Promise<number> {
  return countOf(client, `select count(*) as count from station_runs where report is null and deadline < $1`, [now]);
}

async function countOf(client: Queryable, countSql: string, values: unknown[] = []): Promise<number> {
  const { rows } = await client.query<{ count: string }>(countSql, values);

  return Number(rows[0]!.count);
}

export interface NodeVisitCount {
  openVisit: Visit | null;
  highestIteration: number;
}

export async function nodeVisitCount(client: Queryable, runId: string, nodeId: string): Promise<NodeVisitCount> {
  const { rows } = await client.query(
    `select * from station_runs where assembly_run_id = $1 and node_id = $2 order by iteration desc`,
    [runId, nodeId],
  );
  const visits = rows.map(toVisit);

  return { openVisit: visits.find((visit) => visit.report === null) ?? null, highestIteration: visits.at(0)?.iteration ?? 0 };
}

/** Whether this visit counted a model call that says what it cost: what makes its cost present rather than missing (docs/assembly_run_storage.md, "Costs"). The same reading as `CostsStore.summary`'s own missing-cost count, so the two never disagree. */
export async function pricedCallExists(client: Queryable, visitId: string): Promise<boolean> {
  const { rows } = await client.query(
    `select 1 from station_run_records
     where station_run_id = $1 and kind = 'llm_call' and body->>'costUsd' is not null
     limit 1`,
    [visitId],
  );

  return rows.length > 0;
}

/** The tags of this visit's dispatch, when a worker claimed it: only then may something of the visit exist outside the floor. Null when nobody did. */
export async function claimedDispatchTags(client: Queryable, visitId: string): Promise<string[] | null> {
  const { rows } = await client.query(
    `select tags from events
     where name = 'station_run.dispatch' and payload->>'visitId' = $1 and (claimed_at is not null or acked_at is not null)
     limit 1`,
    [visitId],
  );

  return rows[0] ? (rows[0].tags as string[]) : null;
}

/** Pending agent dispatches only: one a worker has claimed is being worked on, and a service station's has nothing to do with a model provider. Never pulls a later `not_before` earlier. */
export async function deferPendingAgentDispatches(client: Queryable, heldUntil: Date): Promise<void> {
  await client.query(
    `update events set not_before = greatest(not_before, $1)
     where name = 'station_run.dispatch' and tags @> array['kind:agent']
       and claimed_at is null and acked_at is null and dead_at is null and dropped_at is null`,
    [heldUntil],
  );
}
