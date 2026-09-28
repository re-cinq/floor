// The queue every worker pulls from: the floor's own loop claims every name except station_run.dispatch/abort, a cluster agent claims only those, by tag.

import type { Pool, PoolClient } from "pg";
import { addCondition } from "./rows.js";

export interface EnqueueInput {
  name: string;
  payload: unknown;
  /** A repeated enqueue with the same key returns the existing row rather than inserting a second one. */
  dedupeKey?: string;
  /** `station_run.dispatch`/`station_run.abort` only: a claimer must offer every one of these. */
  tags?: string[];
  runId?: string;
  availableAt?: Date;
}

export interface FloorEvent {
  id: string;
  name: string;
  payload: unknown;
  dedupeKey: string | null;
  tags: string[];
  runId: string | null;
  availableAt: Date;
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
const MS_PER_MINUTE = 60_000;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MINUTES = 10;
const MAX_BACKOFF_MS = MAX_BACKOFF_MINUTES * MS_PER_MINUTE;
const CLAIM_STALE_MINUTES = 5;
const CLAIM_STALE_MS = CLAIM_STALE_MINUTES * MS_PER_MINUTE;
const UNCLAIMED_DISPATCH_MINUTES = 30;
const UNCLAIMED_DISPATCH_MS = UNCLAIMED_DISPATCH_MINUTES * MS_PER_MINUTE;

/** min(base * 2^attempts, max). */
export function backoffMs(attempts: number, base = BASE_BACKOFF_MS, max = MAX_BACKOFF_MS): number {
  return Math.min(base * 2 ** Math.max(0, attempts), max);
}

export interface EventStoreDeps {
  connection: Pool | PoolClient;
  now?: () => Date;
}

export class EventStore {
  constructor(private readonly deps: EventStoreDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** Idempotent on `dedupeKey`: a redelivered enqueue returns the existing row rather than inserting a second one. */
  async enqueue(input: EnqueueInput): Promise<FloorEvent> {
    const { rows } = await this.deps.connection.query(
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
        input.availableAt ?? this.now(),
      ],
    );

    return toEvent(rows[0]);
  }

  /** A batch of due, unclaimed (or staled-out) events, filtered to the given names and, when `tags` is given, to events whose own tags are all offered by the caller. */
  async claim(input: { names: string[]; tags?: string[]; limit: number; claimedBy: string }): Promise<FloorEvent[]> {
    return this.claimWhere({
      nameFilter: "name = any($1::text[])",
      nameFilterValue: input.names,
      tags: input.tags,
      limit: input.limit,
      claimedBy: input.claimedBy,
    });
  }

  /** Like `claim`, but takes every due, unclaimed (or staled-out) event whose name is not one of the excluded ones. No tag filter. */
  async claimExcept(input: { excludedNames: string[]; limit: number; claimedBy: string }): Promise<FloorEvent[]> {
    return this.claimWhere({
      nameFilter: "name <> all($1::text[])",
      nameFilterValue: input.excludedNames,
      limit: input.limit,
      claimedBy: input.claimedBy,
    });
  }

  private async claimWhere(input: {
    nameFilter: string;
    nameFilterValue: string[];
    tags?: string[];
    limit: number;
    claimedBy: string;
  }): Promise<FloorEvent[]> {
    const now = this.now();
    const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS);

    const { rows } = await this.deps.connection.query(
      `with candidate as (
         select id from events
         where ${input.nameFilter}
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
      [input.nameFilterValue, now, staleBefore, input.limit, input.claimedBy, input.tags ?? null],
    );

    return rows.map(toEvent);
  }

  async ack(id: string): Promise<void> {
    await this.deps.connection.query(`update events set acked_at = now() where id = $1`, [id]);
  }

  /** Requeues with exponential backoff, unclaimed, unless the max attempts are already spent. */
  async fail(id: string, error: string): Promise<void> {
    const attempts = await this.attemptsOf(id);

    if (attempts + 1 >= MAX_ATTEMPTS) return this.deadLetter(id, error);

    const availableAt = new Date(this.now().getTime() + backoffMs(attempts));

    await this.deps.connection.query(
      `update events set attempts = attempts + 1, last_error = $2, not_before = $3, claimed_at = null where id = $1`,
      [id, error, availableAt],
    );
  }

  /** No retry: an unknown event name, for instance, would never succeed. */
  async deadLetter(id: string, error: string): Promise<void> {
    await this.deps.connection.query(
      `update events set attempts = attempts + 1, last_error = $2, dead_at = $3, claimed_at = null where id = $1`,
      [id, error, this.now()],
    );
  }

  private async attemptsOf(id: string): Promise<number> {
    const { rows } = await this.deps.connection.query(`select attempts from events where id = $1`, [id]);

    return (rows[0]?.attempts as number | undefined) ?? 0;
  }

  /** Drops every unclaimed-or-not-yet-run event for a cancelled run; a claimed one is left for its worker to fail or ack. */
  async dropQueued(runId: string): Promise<void> {
    await this.deps.connection.query(
      `update events set dropped_at = now()
       where run_id = $1 and acked_at is null and dead_at is null and dropped_at is null and claimed_at is null`,
      [runId],
    );
  }

  /** Every station_run.dispatch no worker has ever claimed, aged past UNCLAIMED_DISPATCH_MINUTES: a sweep's cue that no worker offers its tags. */
  async unclaimedDispatches(now: Date): Promise<FloorEvent[]> {
    const before = new Date(now.getTime() - UNCLAIMED_DISPATCH_MS);

    const { rows } = await this.deps.connection.query(
      `select * from events
       where name = 'station_run.dispatch'
         and claimed_at is null and acked_at is null and dead_at is null and dropped_at is null
         and created_at < $1`,
      [before],
    );

    return rows.map(toEvent);
  }

  /** Drops every unresolved event of this name; a claimed one is left for its worker to fail or ack. */
  async dropByName(name: string): Promise<void> {
    await this.deps.connection.query(
      `update events set dropped_at = now()
       where name = $1 and acked_at is null and dead_at is null and dropped_at is null and claimed_at is null`,
      [name],
    );
  }

  /** The one unresolved event of this name due furthest out: a schedule's own cadence event, distinct from an extra triggered one due now. */
  async pendingByName(name: string): Promise<FloorEvent | null> {
    const { rows } = await this.deps.connection.query(
      `select * from events
       where name = $1 and acked_at is null and dead_at is null and dropped_at is null
       order by not_before desc, id desc
       limit 1`,
      [name],
    );

    return rows[0] ? toEvent(rows[0]) : null;
  }

  async get(id: string): Promise<FloorEvent | null> {
    const { rows } = await this.deps.connection.query(`select * from events where id = $1`, [id]);

    return rows[0] ? toEvent(rows[0]) : null;
  }

  async listByRun(runId: string): Promise<FloorEvent[]> {
    const { rows } = await this.deps.connection.query(
      `select * from events where run_id = $1 order by id`,
      [runId],
    );

    return rows.map(toEvent);
  }

  /** Forward pages by id, oldest first, filtered by any of after/name/runId/visitId. */
  async feed(filter: EventsFeedFilter): Promise<EventsFeedPage> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    addCondition(conditions, values, "id > $%::bigint", filter.after);
    addCondition(conditions, values, "name = $%", filter.name);
    addCondition(conditions, values, "run_id = $%", filter.runId);
    addCondition(conditions, values, "payload->>'visitId' = $%", filter.visitId);
    values.push(filter.limit);
    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

    const { rows } = await this.deps.connection.query(
      `select * from events ${where} order by id asc limit $${values.length}`,
      values,
    );
    const matchedEvents = rows.map(toEvent);

    return { items: matchedEvents, nextCursor: matchedEvents.length === filter.limit ? matchedEvents.at(-1)!.id : null };
  }
}

export interface EventsFeedFilter {
  after?: string;
  name?: string;
  runId?: string;
  visitId?: string;
  limit: number;
}

export interface EventsFeedPage {
  items: FloorEvent[];
  nextCursor: string | null;
}

// snake_case here mirrors Postgres's own column names verbatim, a third-party shape (the plugin's own naming-convention exemption case) rather than ours to rename.
/* eslint-disable @typescript-eslint/naming-convention */
interface EventRow {
  id: number | string;
  name: string;
  payload: unknown;
  dedupe_key: string | null;
  tags: string[] | null;
  run_id: string | null;
  not_before: Date;
  created_at: Date;
  claimed_at: Date | null;
  claimed_by: string | null;
  acked_at: Date | null;
  attempts: number;
  last_error: string | null;
  dead_at: Date | null;
  dropped_at: Date | null;
}
/* eslint-enable @typescript-eslint/naming-convention */

function toEvent(row: EventRow): FloorEvent {
  return {
    id: String(row.id),
    name: row.name,
    payload: row.payload,
    dedupeKey: row.dedupe_key,
    tags: row.tags ?? [],
    runId: row.run_id,
    availableAt: row.not_before,
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
