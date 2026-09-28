// Row <-> domain mapping, and the one place a caller chooses pool vs. a transaction's own client.

import type { Pool, PoolClient } from "pg";
import type { NodeVisit } from "@floor/assembly-lines";
import type { AgentSettings, Brief, Item, Report, Run, Visit } from "./types.js";

export type Queryable = Pool | PoolClient;

// snake_case mirrors Postgres's own column names verbatim, a third-party shape rather than ours to rename.
/* eslint-disable @typescript-eslint/naming-convention */
export interface RunRow {
  id: string;
  line_id: string;
  line_hash: string;
  repo: string;
  subject_key: string | null;
  start_items: Record<string, Item>;
  outcome: string | null;
  reason: string | null;
  finished_at: Date | null;
}

export interface StationRunRow {
  station_run_id: string;
  assembly_run_id: string;
  node_id: string;
  iteration: number;
  station_hash: string | null;
  agent_definition_hash: string | null;
  input: { brief: Brief; agentSettings: AgentSettings | null; resumedFrom: string | null; dispatchTags: string[] };
  report: Report | null;
  worker: string | null;
  requested_by: string | null;
  deadline: Date | null;
}
/* eslint-enable @typescript-eslint/naming-convention */

export function toRun(row: RunRow): Run {
  return {
    id: row.id,
    lineId: row.line_id,
    lineHash: row.line_hash,
    repo: row.repo,
    subjectKey: row.subject_key,
    startItems: row.start_items,
    outcome: row.outcome,
    reason: row.reason,
    finishedAt: row.finished_at,
  };
}

export function toVisit(row: StationRunRow): Visit {
  return {
    id: row.station_run_id,
    runId: row.assembly_run_id,
    nodeId: row.node_id,
    iteration: row.iteration,
    stationHash: row.station_hash,
    agentDefinitionHash: row.agent_definition_hash,
    brief: row.input.brief,
    report: row.report,
    worker: row.worker,
    requestedBy: row.requested_by,
    deadline: row.deadline,
    resumedFrom: row.input.resumedFrom,
    agentSettings: row.input.agentSettings,
  };
}

export function toNodeVisit(visit: Visit): NodeVisit {
  return {
    nodeId: visit.nodeId,
    iteration: visit.iteration,
    outcome: visit.report?.outcome ?? null,
    requestedBy: visit.requestedBy,
  };
}

export async function getWith(connection: Queryable, runId: string): Promise<Run | null> {
  const { rows } = await connection.query(`select * from assembly_runs where id = $1`, [runId]);

  return rows[0] ? toRun(rows[0]) : null;
}

export async function visitsWith(connection: Queryable, runId: string): Promise<Visit[]> {
  const { rows } = await connection.query(
    `select * from station_runs where assembly_run_id = $1 order by id`,
    [runId],
  );

  return rows.map(toVisit);
}

/** Appends `template` (its `$%` replaced with the next placeholder) to `conditions` and its value to `values`, unless the value is undefined. */
export function addCondition(conditions: string[], values: unknown[], template: string, value: unknown): void {
  if (value === undefined) return;
  values.push(value);
  conditions.push(template.replace("$%", `$${values.length}`));
}

export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("begin");
    const result = await work(client);

    await client.query("commit");

    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
