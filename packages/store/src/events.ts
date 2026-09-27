// The queue every worker pulls from (docs/assembly_run_storage.md, "Events:
// the queue and the loop"). Claim takes a batch under `FOR UPDATE SKIP
// LOCKED`, filtered by tags when the caller offers some — the floor's own
// loop claims every name except `station_run.dispatch`/`station_run.abort`,
// a cluster agent claims only those, by offering the tags it can run.

import type { Pool, PoolClient } from "pg";

export interface EnqueueInput {
  name: string;
  payload: unknown;
  /** A repeated enqueue with the same key returns the existing row rather than inserting a second one. */
  dedupeKey?: string;
  /** `station_run.dispatch`/`station_run.abort` only: a claimer must offer every one of these. */
  tags?: string[];
  runId?: string;
  notBefore?: Date;
}

export interface FloorEvent {
  id: string;
  name: string;
  payload: unknown;
  dedupeKey: string | null;
  tags: string[];
  runId: string | null;
  notBefore: Date;
  createdAt: Date;
  claimedAt: Date | null;
  claimedBy: string | null;
  ackedAt: Date | null;
  attempts: number;
  lastError: string | null;
  deadAt: Date | null;
  droppedAt: Date | null;
}

const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 10 * 60 * 1_000;
const CLAIM_STALE_MS = 5 * 60 * 1_000;

/** min(base * 2^attempts, max). */
export function backoffMs(attempts: number, base = BASE_BACKOFF_MS, max = MAX_BACKOFF_MS): number {
  return Math.min(base * 2 ** Math.max(0, attempts), max);
}

export interface EventStoreDeps {
  db: Pool | PoolClient;
  now?: () => Date;
}

export class EventStore {
  constructor(private readonly deps: EventStoreDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** Idempotent on `dedupeKey`: a redelivered enqueue returns the row that already exists rather than inserting a second one. */
  async enqueue(input: EnqueueInput): Promise<FloorEvent> {
    const { rows } = await this.deps.db.query(
      `insert into events (name, payload, dedupe_key, tags, run_id, not_before)
       values ($1, $2::jsonb, $3, coalesce($4::text[], '{}'), $5, $6::timestamptz)
       on conflict (dedupe_key) do update set dedupe_key = events.dedupe_key
       returning *`,
      [
        input.name,
        JSON.stringify(input.payload),
        input.dedupeKey ?? null,
        input.tags ?? null,
        input.runId ?? null,
        input.notBefore ?? this.now(),
      ],
    );

    return toEvent(rows[0]);
  }

  /**
   * A batch of due, unclaimed (or staled-out) events, filtered to the given
   * names and, when `tags` is given, to events whose own tags are all
   * offered by the caller (`tags <@ $offered`; an event with no tags always
   * matches). Claimed under `FOR UPDATE SKIP LOCKED`, so two claimers never
   * take the same row.
   */
  async claim(input: { names: string[]; tags?: string[]; limit: number; claimedBy: string }): Promise<FloorEvent[]> {
    const now = this.now();
    const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS);

    const { rows } = await this.deps.db.query(
      `with candidate as (
         select id from events
         where name = any($1::text[])
           and not_before <= $2
           and acked_at is null and dead_at is null and dropped_at is null
           and (claimed_at is null or claimed_at < $3)
           and ($6::text[] is null or tags <@ $6::text[])
         order by id
         limit $4
         for update skip locked
       )
       update events set claimed_at = $2, claimed_by = $5
       from candidate where events.id = candidate.id
       returning events.*`,
      [input.names, now, staleBefore, input.limit, input.claimedBy, input.tags ?? null],
    );

    return rows.map(toEvent);
  }

  async ack(id: string): Promise<void> {
    await this.deps.db.query(`update events set acked_at = now() where id = $1`, [id]);
  }

  /**
   * Requeues with exponential backoff, unclaimed; dead-letters past
   * `MAX_ATTEMPTS`, or immediately when `permanent` is set (an unknown
   * event name, for instance — retrying it would never succeed).
   */
  async fail(id: string, error: string, permanent = false): Promise<void> {
    const now = this.now();
    const { rows } = await this.deps.db.query(
      `select attempts from events where id = $1`,
      [id],
    );
    const attempts = (rows[0]?.attempts as number | undefined) ?? 0;
    const dead = permanent || attempts + 1 >= MAX_ATTEMPTS;

    if (dead) {
      await this.deps.db.query(
        `update events set attempts = attempts + 1, last_error = $2, dead_at = $3, claimed_at = null where id = $1`,
        [id, error, now],
      );

      return;
    }
    const notBefore = new Date(now.getTime() + backoffMs(attempts));

    await this.deps.db.query(
      `update events set attempts = attempts + 1, last_error = $2, not_before = $3, claimed_at = null where id = $1`,
      [id, error, notBefore],
    );
  }

  /** Drops every unclaimed-or-not-yet-run event for a cancelled run; a claimed one is left for its worker to fail or ack. */
  async dropQueued(runId: string): Promise<void> {
    await this.deps.db.query(
      `update events set dropped_at = now()
       where run_id = $1 and acked_at is null and dead_at is null and dropped_at is null and claimed_at is null`,
      [runId],
    );
  }

  async get(id: string): Promise<FloorEvent | null> {
    const { rows } = await this.deps.db.query(`select * from events where id = $1`, [id]);

    return rows[0] ? toEvent(rows[0]) : null;
  }

  async listByRun(runId: string): Promise<FloorEvent[]> {
    const { rows } = await this.deps.db.query(
      `select * from events where run_id = $1 order by id`,
      [runId],
    );

    return rows.map(toEvent);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toEvent(row: any): FloorEvent {
  return {
    id: String(row.id),
    name: row.name,
    payload: row.payload,
    dedupeKey: row.dedupe_key,
    tags: row.tags ?? [],
    runId: row.run_id,
    notBefore: row.not_before,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
    claimedBy: row.claimed_by,
    ackedAt: row.acked_at,
    attempts: row.attempts,
    lastError: row.last_error,
    deadAt: row.dead_at,
    droppedAt: row.dropped_at,
  };
}
