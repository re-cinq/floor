# @floor/store

The events queue, the definitions store, and the `AssemblyRunStore` itself —
the whole storage layer the plan describes (see
[docs/assembly_run_storage.md](../../docs/assembly_run_storage.md)). This
package is new — lore has no counterpart to port from; its event bus is a
separate service (`event-router`) with a subscriber/delivery model this plan
replaces with one table and a tag filter.

## Where this fits

The only package that speaks to Postgres, and [`apps/api`](../../apps/api/README.md) is its only
caller — no worker links it, so the queue is the only way into a floor's state. It calls
[`@floor/assembly-lines`](../assembly-lines/README.md) for the walk decision and owns everything
around it: the tables, the definitions, the queue, and the transaction that makes a report and what
follows from it one write.

See [the map](../../README.md) for what sits either side of it.

## What is here

- `migrations/0001_init.sql` — `definitions`, `assembly_runs`, `station_runs`,
  `events`, `blobs`, `station_run_records`, exactly as the storage doc's
  "Tables" section specifies. `station_runs.outcome`/`session_ref` are
  generated columns read out of the report's own JSON, so they can never
  disagree with it.
- `migrations/0002_run_feed.sql` — `run_feed`, the run journal: everything
  that happens in a run, numbered 1, 2, 3 per run with no gap. Four triggers
  write it, on a record appended, a visit opened, a visit reported and a run
  settled, so no code that writes can forget to. Each entry is numbered
  under `pg_advisory_xact_lock(7233, hashtext(run))` and announced with
  `pg_notify('floor_run_feed', {schema, run})`.
- `run-journal.ts` — `RunJournal.since(runId, after, limit)`: the journal's
  entries after a cursor, each with its visit and, for a record, the record,
  joined in at read time. A `visit_opened` entry tells the visit as it was
  opened, with no report. Null for a run that does not exist.
- `run-notifier.ts` — `PgRunNotifier`: who is told when a run's journal
  grows. One listening connection per process, outside the pool, named
  `floor-run-listener`, opened by the first `subscribe`. A notice from
  another schema is dropped. When the connection is lost it listens again
  with backoff and calls every listener's `resync`. `close()` ends it.
- `pg.ts` — one pool per process, and a plain migration runner (a
  `schema_migrations` table tracking applied filenames; no framework).
  `migrate` holds a Postgres advisory lock for its whole run
  (`withAdvisoryLock` in `lease.ts`), on one connection. Every API replica
  migrates at start and so does the chart's hook Job; the second waits for
  the first and then finds nothing left to do. Without the lock two of them
  collide inside Postgres on `create table if not exists`, which
  `migrate.test.ts` shows.
- `run-args.ts` — `valueArgsOf`: a run's `value` start items by name, which
  `internal.run.started` and `internal.run.settled` carry as `args`. Files
  and repositories are left out.
- `events.ts` — `EventStore`: `enqueue` (idempotent on `dedupeKey`), `claim`
  (a batch under `FOR UPDATE SKIP LOCKED`, filtered by name and, for
  `station_run.dispatch`/`abort`, by tag subset), `claimExcept` (the same
  batch semantics, but every name other than the excluded ones, no tag
  filter — the floor's own loop's claim), `ack`, `fail`/`deadLetter`
  (exponential backoff, or immediate dead-letter), `dropQueued` (for
  `cancel`), `listByRun`, `feed` (the polled feed: pages forward by id,
  filtered by any of `after`/`name`/`runId`/`visitId`), `unclaimedDispatches`
  (every `station_run.dispatch` no worker has claimed in 30 minutes — a
  sweep's cue that no worker offers its tags).
- `events-retention.ts` — `reapSettledRunEvents`: deletes the events of runs
  settled before a cutoff (30 days, `EVENT_RETENTION_MS`), never an
  `internal.*` event nor one of no run.
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
  against the bag, `foldLineFiles` (a line's own `files` turned into `file`
  items `by: "line"`, seeded into `start` before the caller's own start
  items, which win on a name clash), the bag fold itself (start items plus
  each done visit's produced items), and the walk kernel's graph built from
  stored line/station definitions.
- `rows.ts`, `sql.ts`, `open-visit.ts` — the row mapping, the mutation/query
  SQL (including `blobHashesExist`, checked against a line's `files` before
  a run starts on them), and resolution-at-open (station, agent definition
  and repo variant, needs, conversation continuation, failure context,
  deadline, dispatch tags) behind the store.
- `assembly-run-store.ts` — `AssemblyRunStore`: `start`, `get`, `list`,
  `cancel`, `fail`, `bag` (and `bagOf`, for a caller that already holds the
  run), `next`, `settle`, `openVisit`, `openVisitByHand`,
  `nodeStartedBy`, `report`, `visits`, `visit`, `overdueVisits` (every open
  visit whose deadline has passed — a human visit's deadline is null, so it
  never matches). What a start, a list and a page take and answer is in
  `run-shapes.ts`, so the SQL beside the store does not import the store. Every follow-up event is written in the same transaction as the
  row that caused it (docs/assembly_run_storage.md, "Every follow-up event
  is written in the transaction that caused it"). A report on a visit
  whose dispatch a worker claimed also posts `station_run.abort`, so the
  worker lets go of whatever it holds for the visit; cancel and fail post it
  for every open visit. `openVisitByHand` on a finished run reopens it (`reopenRun`, then
  `closeOpenVisits` on everything its settling left open) and posts
  `internal.run.reopened`; another open run on its subject refuses it.
- `start-events.ts`, `refusal.ts` — a node's start event name (its line's own
  `start:`, or `node.<id>.start`), and `Refusal`: the error for a request the
  store will never accept, as opposed to one worth retrying.
- `template.ts` — the one template engine: `{name}` over own, scalar fields
  only, single-pass, refused past 4 KB. Its tests are named after the attack
  each one stops.
- `line-validation.ts` — `validateLine`: every semantic problem in a line
  body, not the first — entry, exit and edge endpoints name real nodes, node
  ids are unique, `fail` (when given) names a node that is neither the entry
  nor the exit, every node but the exit and the fail node has an outgoing
  edge and neither of those two has one, `start.args`
  names a declared argument, at most one argument is `subject`, and every
  node's station (its `@hash` pin stripped) is a known one.
- `event-match.ts`, `outside-events.ts` — events from outside the walk.
  `OutsideEvents.startLines` starts every line whose latest version declares
  the event under `start.on` (`when` is equality, `args` are templates over
  the payload); `answer` writes the outcome a waiting node's `reports`
  declares for it; `runFor` finds the run by id, or by subject and repo, a
  subject alone naming a run with no repo. An event whose payload names no
  repo starts a run with none, on a line that has no `git` argument. A
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
- `costs.ts` — `CostsStore.summary`: cost and tokens in/out summed in SQL
  over `llm_call` records, joined to `station_runs`/`assembly_runs`/
  `definitions` for repo, line, station and model, grouped by day, line,
  station or model, and filtered by any of repo/line/station/since/until.
  A visit counts as missing cost when it has an agent definition hash and a
  report but no `llm_call` record with a numeric `costUsd`.

## Testing

Real Postgres, not a fake — `FOR UPDATE SKIP LOCKED` has no meaningful
in-memory stand-in, and a queue's correctness lives in the SQL. One command
stands up a dedicated container (separate from any other Postgres you run
locally):

```
npm run db:up      # from the repo root; floor-postgres on :5433
npm test -w @floor/store
```

The suites run in their own database, `floor_test`, created on first use:
every suite truncates its tables between tests, which on the database a
floor is running against would delete its runs from under it.
`FLOOR_TEST_DATABASE_URL` overrides the default
`postgres://postgres:floor@localhost:5433/floor_test`.
