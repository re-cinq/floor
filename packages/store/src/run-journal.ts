// The run journal, read (docs/assembly_run_storage.md, "The run journal"): everything that happened in a run, in one order and under one cursor. Postgres writes it, by trigger; this only reads.
import type { Pool } from "pg";
import type { RecordKind, StationRunRecord } from "./records.js";
import { getWith, toVisit, type StationRunRow } from "./rows.js";
import type { Run, Visit } from "./types.js";

interface Entered {
  /** The run's cursor: 1, 2, 3, with no gap. */
  seq: number;
  occurredAt: Date;
}

export type JournalEntry = Entered &
  (
    | { kind: "record"; visit: Visit; record: StationRunRecord }
    | { kind: "visit_opened"; visit: Visit }
    | { kind: "visit_reported"; visit: Visit }
    | { kind: "run_settled"; run: Run }
  );

export interface JournalPage {
  items: JournalEntry[];
  /** Null once the journal has been read to its end. */
  nextCursor: number | null;
}

export interface RunJournalDeps {
  pool: Pool;
}

// snake_case mirrors Postgres's own column names verbatim, a third-party shape rather than ours to rename.
/* eslint-disable @typescript-eslint/naming-convention */
interface FeedRow {
  seq: string;
  kind: "record" | "visit_opened" | "visit_reported" | "run_settled";
  visit_id: string | null;
  record_kind: RecordKind | null;
  record_seq: number | null;
  at: Date;
  record_body: unknown;
  record_at: Date | null;
}
/* eslint-enable @typescript-eslint/naming-convention */

interface Read {
  run: Run;
  visits: Map<string, Visit>;
}

export class RunJournal {
  constructor(private readonly deps: RunJournalDeps) {}

  /** Null for a run that does not exist. */
  async since(runId: string, after: number, limit: number): Promise<JournalPage | null> {
    const run = await getWith(this.deps.pool, runId);

    if (!run) return null;
    const rows = await this.rowsSince(runId, after, limit);
    const read = { run, visits: await this.visitsOf(rows) };
    const entries = rows.flatMap((row) => entryOf(row, read));
    const last = rows.at(-1);

    return { items: entries, nextCursor: last && rows.length === limit ? Number(last.seq) : null };
  }

  private async rowsSince(runId: string, after: number, limit: number): Promise<FeedRow[]> {
    const { rows } = await this.deps.pool.query(
      `select feed.seq, feed.kind, feed.visit_id, feed.record_kind, feed.record_seq, feed.at, record.body as record_body, record.at as record_at
       from run_feed feed
       left join station_run_records record
         on record.station_run_id = feed.visit_id and record.kind = feed.record_kind and record.seq = feed.record_seq
       where feed.run_id = $1 and feed.seq > $2
       order by feed.seq
       limit $3`,
      [runId, after, limit],
    );

    return rows as FeedRow[];
  }

  private async visitsOf(rows: FeedRow[]): Promise<Map<string, Visit>> {
    const ids = [...new Set(rows.flatMap((row) => row.visit_id ?? []))];
    const found = await this.deps.pool.query(`select * from station_runs where station_run_id = any($1::uuid[])`, [ids]);
    const visits = (found.rows as StationRunRow[]).map(toVisit);

    return new Map(visits.map((visit) => [visit.id, visit]));
  }
}

// An entry whose visit is gone, which only a deleted run leaves behind, is left out.
function entryOf(row: FeedRow, read: Read): JournalEntry[] {
  const entered = { seq: Number(row.seq), occurredAt: row.at };

  if (row.kind === "run_settled") return [{ ...entered, kind: row.kind, run: read.run }];
  const visit = read.visits.get(row.visit_id ?? "");

  return visit ? [aboutVisit(row, { entered, visit })] : [];
}

function aboutVisit(row: FeedRow, about: { entered: Entered; visit: Visit }): JournalEntry {
  const { entered, visit } = about;

  if (row.kind === "record") return { ...entered, kind: "record", visit, record: recordOf(row, visit.id) };
  // A visit is read as it is now; as it was opened, it had no report and nobody had claimed it.
  if (row.kind === "visit_opened") return { ...entered, kind: "visit_opened", visit: { ...visit, report: null, worker: null } };

  return { ...entered, kind: "visit_reported", visit };
}

function recordOf(row: FeedRow, visitId: string): StationRunRecord {
  return { visitId, kind: row.record_kind ?? "log", seq: row.record_seq ?? 0, body: row.record_body, occurredAt: row.record_at ?? row.at };
}
