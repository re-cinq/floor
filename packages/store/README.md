# @floor/store

The events queue and the six-table Postgres schema behind the whole plan
(see [docs/assembly_run_storage.md](../../docs/assembly_run_storage.md),
"Events: the queue and the loop" and "Tables"). This package is new — lore
has no counterpart to port from; its event bus is a separate service
(`event-router`) with a subscriber/delivery model this plan replaces with
one table and a tag filter.

## What is here

- `migrations/0001_init.sql` — `definitions`, `assembly_runs`, `station_runs`,
  `events`, `blobs`, `station_run_records`, exactly as the storage doc's
  "Tables" section specifies. `station_runs.outcome`/`session_ref` are
  generated columns read out of the report's own JSON, so they can never
  disagree with it.
- `pg.ts` — one pool per process, and a plain migration runner (a
  `schema_migrations` table tracking applied filenames; no framework).
- `events.ts` — `EventStore`: `enqueue` (idempotent on `dedupeKey`), `claim`
  (a batch under `FOR UPDATE SKIP LOCKED`, filtered by name and, for
  `station_run.dispatch`/`abort`, by tag subset), `ack`, `fail` (exponential
  backoff, dead-letter past 8 attempts or immediately when told the failure
  is permanent), `dropQueued` (for `cancel`), `listByRun`.

## Not yet here

The `AssemblyRunStore` itself (start/openVisit/report/bag/next/settle) —
the storage doc's other half, everything that isn't the queue. That is the
next layer, and it is built on this one: every operation it exposes writes
its follow-up event in the same transaction (docs/assembly_run_storage.md,
"Every follow-up event is written in the transaction that caused it"), which
is why the queue had to exist first.

## Testing

Real Postgres, not a fake — `FOR UPDATE SKIP LOCKED` has no meaningful
in-memory stand-in, and a queue's correctness lives in the SQL. One command
stands up a dedicated container (separate from any other Postgres you run
locally):

```
npm run db:up      # from the repo root; floor-postgres on :5433
npm test -w @floor/store
```

`FLOOR_DATABASE_URL` overrides the default
`postgres://postgres:floor@localhost:5433/floor`. Migrations run
automatically at the start of the test suite (`beforeAll`); `events` is
truncated between tests.
