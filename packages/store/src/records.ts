// A visit's own log/turn/llm_call trail (docs/api_sketch.md, "Records"): one append-only, per-kind sequence over station_run_records.

import type { Pool, PoolClient } from "pg";
import { enforce } from "./refusal.js";
import { withTransaction } from "./rows.js";

/** `produced` and `session` are the sink's own notes on a visit still running: what it has uploaded so far, and where its conversation was saved. */
export type RecordKind = "log" | "turn" | "llm_call" | "produced" | "session";

export interface RecordInput {
  kind: RecordKind;
  body: unknown;
  occurredAt: Date;
}

export interface StationRunRecord {
  visitId: string;
  kind: RecordKind;
  seq: number;
  body: unknown;
  occurredAt: Date;
}

export interface ListRecordsOptions {
  after?: number;
  limit: number;
}

export interface RecordsPage {
  items: StationRunRecord[];
  nextCursor: number | null;
}

const BYTES_PER_KIB = 1024;
const MAX_RECORD_BODY_KIB = 64;
export const MAX_RECORD_BODY_BYTES = MAX_RECORD_BODY_KIB * BYTES_PER_KIB;

export interface RecordsStoreDeps {
  pool: Pool;
}

export class RecordsStore {
  constructor(private readonly deps: RecordsStoreDeps) {}

  /** Assigns each record the next seq for its own (visitId, kind); one insert per kind, inside one transaction, an advisory lock on the visit serializing concurrent appends. */
  async append(visitId: string, records: RecordInput[]): Promise<StationRunRecord[]> {
    for (const record of records) enforceBodySize(record.body);

    return withTransaction(this.deps.pool, async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [visitId]);
      const appended: StationRunRecord[] = [];

      for (const [kind, group] of groupByKind(records)) {
        appended.push(...(await appendKind(client, visitId, kind, group)));
      }

      return appended;
    });
  }

  /** The newest record of a kind, or null: what the sink last noted. */
  async latest(visitId: string, kind: RecordKind): Promise<StationRunRecord | null> {
    const { rows } = await this.deps.pool.query(
      `select * from station_run_records where station_run_id = $1 and kind = $2 order by seq desc limit 1`,
      [visitId, kind],
    );

    return rows[0] ? toRecord(rows[0]) : null;
  }

  async list(visitId: string, kind: RecordKind, options: ListRecordsOptions): Promise<RecordsPage> {
    const { rows } = await this.deps.pool.query(
      `select * from station_run_records where station_run_id = $1 and kind = $2 and seq > $3 order by seq limit $4`,
      [visitId, kind, options.after ?? 0, options.limit],
    );
    const records = rows.map(toRecord);

    return { items: records, nextCursor: records.length === options.limit ? records.at(-1)!.seq : null };
  }
}

function enforceBodySize(body: unknown): void {
  const size = Buffer.byteLength(JSON.stringify(body));

  enforce(size <= MAX_RECORD_BODY_BYTES, `record body of ${size} bytes exceeds the ${MAX_RECORD_BODY_BYTES}-byte cap`);
}

function groupByKind(records: RecordInput[]): Map<RecordKind, RecordInput[]> {
  const groups = new Map<RecordKind, RecordInput[]>();

  for (const record of records) {
    const group = groups.get(record.kind) ?? [];

    group.push(record);
    groups.set(record.kind, group);
  }

  return groups;
}

async function appendKind(client: PoolClient, visitId: string, kind: RecordKind, group: RecordInput[]): Promise<StationRunRecord[]> {
  const elements = group.map((record) => ({ body: record.body, occurredAt: record.occurredAt }));

  const { rows } = await client.query(
    `with next as (
       select coalesce(max(seq), 0) as base from station_run_records where station_run_id = $1 and kind = $2
     ), input as (
       select (elem ->> 'occurredAt')::timestamptz as at, elem -> 'body' as body, rn
       from jsonb_array_elements($3::jsonb) with ordinality as listed(elem, rn)
     )
     insert into station_run_records (station_run_id, kind, seq, body, at)
     select $1, $2, next.base + input.rn, input.body, input.at
     from input, next
     returning *`,
    [visitId, kind, JSON.stringify(elements)],
  );

  return rows.map(toRecord);
}

// snake_case mirrors Postgres's own column names verbatim, a third-party shape rather than ours to rename.
/* eslint-disable @typescript-eslint/naming-convention */
interface RecordRow {
  station_run_id: string;
  kind: RecordKind;
  seq: number;
  body: unknown;
  at: Date;
}
/* eslint-enable @typescript-eslint/naming-convention */

function toRecord(row: RecordRow): StationRunRecord {
  return { visitId: row.station_run_id, kind: row.kind, seq: row.seq, body: row.body, occurredAt: row.at };
}
