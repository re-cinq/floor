// The mutations and list query behind the store: one statement each, plus the compare-and-set report write.

import type { PoolClient } from "pg";
import { Refusal, enforce } from "./refusal.js";
import { toRun, toVisit, type Queryable, type StationRunRow } from "./rows.js";
import type { Report, Run, Visit } from "./types.js";
import type { OpenContext } from "./open-visit.js";
import type { Page, RunFilter, StartRunInput } from "./assembly-run-store.js";

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
    [input.lineId, lineHash, input.repo, subjectKey, JSON.stringify(input.startItems)],
  );

  return rows[0] ? toRun(rows[0]) : null;
}

export async function openRunBySubject(client: Queryable, repo: string, subjectKey: string): Promise<Run | null> {
  const { rows } = await client.query(
    `select * from assembly_runs where repo = $1 and subject_key = $2 and finished_at is null`,
    [repo, subjectKey],
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

  return toRun(rows[0]);
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

  return toVisit(stored);
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
  addCondition(conditions, values, "repo = $%", filter.repo);
  addCondition(conditions, values, "subject_key = $%", filter.subjectKey);
  if (filter.open !== undefined) conditions.push(filter.open ? "finished_at is null" : "finished_at is not null");
  if (page.cursor) addCondition(conditions, values, "id < $%", page.cursor);
  values.push(page.limit);

  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

  return { text: `select * from assembly_runs ${where} order by id desc limit $${values.length}`, values };
}

function addCondition(conditions: string[], values: unknown[], template: string, value: unknown): void {
  if (value === undefined) return;
  values.push(value);
  conditions.push(template.replace("$%", `$${values.length}`));
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
