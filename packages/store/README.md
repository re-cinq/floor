# @floor/store

The events queue, the definitions store, and the `AssemblyRunStore` itself —
the whole storage layer the plan describes (see
[docs/assembly_run_storage.md](../../docs/assembly_run_storage.md)). This
package is new — lore has no counterpart to port from; its event bus is a
separate service (`event-router`) with a subscriber/delivery model this plan
replaces with one table and a tag filter.

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
  `station_run.dispatch`/`abort`, by tag subset), `claimExcept` (the same
  batch semantics, but every name other than the excluded ones, no tag
  filter — the floor's own loop's claim), `ack`, `fail`/`deadLetter`
  (exponential backoff, or immediate dead-letter), `dropQueued` (for
  `cancel`), `listByRun`, `unclaimedDispatches` (every `station_run.dispatch`
  no worker has claimed in 30 minutes — a sweep's cue that no worker offers
  its tags).
- `lease.ts` — `acquireLease`/`Lease`: a Postgres advisory lock
  (`pg_try_advisory_lock`) held on a dedicated client for the lease's
  lifetime, since the lock is session-scoped and a pooled `pool.query`
  would drop it on the next checkout. `isHeld()` says whether that
  connection is still there; once it is not, the client is destroyed rather
  than handed back to the pool.
- `definitions.ts` — `DefinitionsStore`: `put` (idempotent by content hash),
  `latest`, `byHash`, `byHashOnly` (hash alone, no id — a visit only ever
  records a station's hash), `versions`, `archive`.
- `resolve.ts`, `bag.ts`, `walk-graph.ts` — pure helpers: need resolution
  against the bag, the bag fold itself (start items plus each done visit's
  produced items), and the walk kernel's graph built from stored line/station
  definitions.
- `rows.ts`, `sql.ts`, `open-visit.ts` — the row mapping, the mutation/query
  SQL, and resolution-at-open (station, agent definition and repo variant,
  needs, conversation continuation, failure context, deadline, dispatch
  tags) behind the store.
- `assembly-run-store.ts` — `AssemblyRunStore`: `start`, `get`, `list`,
  `cancel`, `fail`, `bag`, `next`, `settle`, `openVisit`, `openVisitByHand`,
  `nodeStartedBy`, `report`, `visits`, `visit`, `overdueVisits` (every open
  visit whose deadline has passed — a human visit's deadline is null, so it
  never matches). Every follow-up event is written in the same transaction as the
  row that caused it (docs/assembly_run_storage.md, "Every follow-up event
  is written in the transaction that caused it").
- `start-events.ts`, `refusal.ts` — a node's start event name (its line's own
  `start:`, or `node.<id>.start`), and `Refusal`: the error for a request the
  store will never accept, as opposed to one worth retrying.
- `template.ts` — the one template engine: `{name}` over own, scalar fields
  only, single-pass, refused past 4 KB. Its tests are named after the attack
  each one stops.
- `event-match.ts`, `outside-events.ts` — events from outside the walk.
  `OutsideEvents.startLines` starts every line whose latest version declares
  the event under `start.on` (`when` is equality, `args` are templates over
  the payload); `answer` writes the outcome a waiting node's `reports`
  declares for it; `runFor` finds the run by id, or by subject and repo. A
  line never starts on an internal event of its own runs.
- `dispatch-brief.ts` — `DispatchBriefs.briefFor`: a visit's needs for a
  machine. Values come from the brief the visit froze; files and git repos
  are placed from the bag through the node's `bind`, a git need at the sha
  the visit was promised.
- `blobs.ts` — `BlobsStore`: `put` (content-addressed by sha256, idempotent,
  refuses over the 64 MB cap rather than truncating), `get`,
  `reapUnreferenced` (deletes and returns every hash no start item, produced
  item or `sessionRef` still names).
- `records.ts` — `RecordsStore`: a visit's own `log`/`turn`/`llm_call`
  trail over `station_run_records`. `append` assigns each record the next
  `seq` for its own (visit, kind), one insert per kind inside one
  transaction, an advisory lock (`pg_advisory_xact_lock` on the visit)
  serializing concurrent appends; refuses a body over 64 KB with a
  `Refusal`, never truncating. `list` pages forward by `seq`
  (`{ after, limit }` in, `{ items, nextCursor }` out).

## Not yet here

The Floor's HTTP API itself.

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
