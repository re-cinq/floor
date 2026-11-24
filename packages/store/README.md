# @floor/store

The events queue, the definitions store and the `AssemblyRunStore`: the whole storage layer the plan describes (see [docs/assembly_run_storage.md](../../docs/assembly_run_storage.md)). This package is new. lore has no counterpart to port from. Its event bus is a separate service (`event-router`) with a subscriber/delivery model, which this plan replaces with one table and a tag filter.

## Where this fits

This is the only package that speaks to Postgres, and [`apps/api`](../../apps/api/README.md) is its only caller. No worker links it, so the queue is the only way into a floor's state. It calls [`@re-cinq/floor-assembly-lines`](../assembly-lines/README.md) for the walk decision and owns everything around it: the tables, the definitions, the queue, and the transaction that makes a report and what follows from it one write.

See [the map](../../README.md) for what sits either side of it.

## What is here

### Migrations and the connection

- `migrations/0001_init.sql` creates `definitions`, `assembly_runs`, `station_runs`, `events`, `blobs` and `station_run_records`, exactly as the storage doc's "Tables" section specifies. `station_runs.outcome` and `session_ref` are generated columns read out of the report's own JSON, so they can never disagree with it.
- `migrations/0002_run_feed.sql` creates `run_feed`, the run journal: everything that happens in a run, numbered 1, 2, 3 per run with no gap. Four triggers write it, on a record appended, a visit opened, a visit reported and a run settled, so no code that writes can forget to. Each entry is numbered under `pg_advisory_xact_lock(7233, hashtext(run))` and announced with `pg_notify('floor_run_feed', {schema, run})`.
- `migrations/0003_run_without_repo.sql` lets a run belong to no repository. Such a run stores a null repo, and two repo-less starts on one subject still join.
- `migrations/0004_floor_feed.sql` adds the floor-wide feed. A trigger on a new run tells a listener of the whole floor that a run started, and the notice names its kind.
- `migrations/0005_run_reopened.sql` journals a start by hand that reopens a settled run as `run_reopened`.
- `migrations/0006_fanout.sql` adds `station_runs.branch`, so a visit is told apart by node, iteration and branch.
- `migrations/0007_clusters.sql` creates `clusters` and `cluster_agent_definitions`: the clusters a floor drives and what each holds of every agent definition.
- `migrations/0008_cluster_versions.sql` adds `build` and `subsystem` to `clusters`, what each cluster-agent reports on every register.
- `pg.ts` has one pool per process and a plain migration runner, a `schema_migrations` table tracking applied filenames with no framework. `migrate` holds a Postgres advisory lock for its whole run (`withAdvisoryLock` in `lease.ts`), on one connection. Every API replica migrates at start and so does the chart's hook Job. The second waits for the first and then finds nothing left to do. Without the lock two of them collide inside Postgres on `create table if not exists`, which `migrate.test.ts` shows.
- `lease.ts` has `acquireLease`/`Lease`, a Postgres advisory lock (`pg_try_advisory_lock`) held on a dedicated client for the lease's lifetime. The lock is session-scoped, and a pooled `pool.query` would drop it on the next checkout. `isHeld()` says whether that connection is still there. Once it is not, the client is destroyed and not handed back to the pool.

### The run journal

- `run-journal.ts` has `RunJournal.since(runId, after, limit)`: the journal's entries after a cursor, each with its visit and, for a record, the record, joined in at read time. A `visit_opened` entry tells the visit as it was opened, with no report. It answers null for a run that does not exist.
- `run-notifier.ts` has `PgRunNotifier`, which tells listeners when a run's journal grows. It keeps one listening connection per process, outside the pool, named `floor-run-listener` and opened by the first `subscribe`. A notice from another schema is dropped. When the connection is lost it listens again with backoff and calls every listener's `resync`. `close()` ends it.

### Events

- `events.ts` has `EventStore`:
  - `enqueue` is idempotent on `dedupeKey`.
  - `claim` takes a batch under `FOR UPDATE SKIP LOCKED`, filtered by name and, for `station_run.dispatch`/`abort`, by tag subset.
  - `claimExcept` has the same batch semantics but takes every name other than the excluded ones, with no tag filter. It is the floor's own loop's claim.
  - `ack`, and `fail`/`deadLetter` (exponential backoff, or immediate dead-letter).
  - `dropQueued` is for `cancel`.
  - `listByRun`, and `feed`, the polled feed, which pages forward by id and filters by any of `after`/`name`/`runId`/`visitId`.
  - `unclaimedDispatches` is every `station_run.dispatch` no worker has claimed in 30 minutes, a sweep's cue that no worker offers its tags.
- `events-retention.ts` has `reapSettledRunEvents`, which deletes the events of runs settled before a cutoff (30 days, `EVENT_RETENTION_MS`), never an `internal.*` event nor one of no run.
- `event-match.ts` and `outside-events.ts` handle events from outside the walk. `OutsideEvents.startLines` starts every assembly line whose latest version declares the event under `start.on` (`when` is equality, `args` are templates over the payload). `answer` writes the outcome a waiting node's `reports` declares for it. `runFor` finds the run by id, or by subject and repo, a subject alone naming a run with no repo. An event whose payload names no repo starts a run with none, on an assembly line that has no `git` argument. An assembly line never starts on an internal event of its own runs.

### Definitions and lines

- `definitions.ts` has `DefinitionsStore`: `put` (idempotent by content hash), `latest`, `byHash`, `byHashOnly` (hash alone with no id, since a visit only ever records a station's hash), `versions` and `archive`.
- `run-args.ts` has `valueArgsOf`: a run's `value` start items by name, which `internal.run.started` and `internal.run.settled` carry as `args`. Files and repositories are left out.
- `gitArgNames`, in `@re-cinq/floor-assembly-lines`' `line-args.ts`, says which of an assembly line's arguments are of kind `git`. It is the one place that is asked. A start with no repo is refused when there is one, and a station's `git` need is checked against them.
- `validateLine`, in `@re-cinq/floor-assembly-lines`' `line-validation.ts` and re-exported here, reports every semantic problem in a line body, not only the first:
  - entry, exit and edge endpoints name real nodes
  - node ids are unique
  - `fail`, when given, names a node that is neither the entry nor the exit
  - every node but the exit and the fail node has an outgoing edge, and neither of those two has one
  - `start.args` names a declared argument
  - at most one argument is `subject`
  - every node's station (its `@hash` pin stripped) is a known one
- `start-events.ts` and `refusal.ts`, also in `@re-cinq/floor-assembly-lines`, give a node's start event name (its line's own `start:`, or `node.<id>.start`) and `Refusal`, the error for a request the store will never accept, as opposed to one worth retrying.
- `template.ts` is the one template engine: `{name}` over own, scalar fields only, single-pass, refused past 4 KB. Its tests are named after the attack each one stops.

### The run store

- `assembly-run-store.ts` has `AssemblyRunStore`: `start`, `get`, `list`, `cancel`, `fail`, `bag` (and `bagOf`, for a caller that already holds the run), `next`, `settle`, `openVisit`, `openVisitByHand`, `nodeStartedBy`, `report`, `visits`, `visit` and `overdueVisits`. `overdueVisits` is every open visit whose deadline has passed. A human visit's deadline is null, so it never matches. What a start, a list and a page take and answer is in `run-shapes.ts`, so the SQL beside the store does not import the store.
  - Every follow-up event is written in the same transaction as the row that caused it (docs/assembly_run_storage.md, "Every follow-up event is written in the transaction that caused it").
  - A report on a visit whose dispatch a worker claimed also posts `station_run.abort`, so the worker lets go of whatever it holds for the visit. Cancel and fail post it for every open visit.
  - `openVisitByHand` on a finished run reopens it (`reopenRun`, then `closeOpenVisits` on everything its settling left open) and posts `internal.run.reopened`. Another open run on its subject refuses it.
- `resolve.ts`, `bag.ts` and `walk-graph.ts` are pure helpers: need resolution against the bag, `foldLineFiles`, the bag fold itself (start items plus each done visit's produced items), and the walk kernel's graph built from stored line and station definitions. `foldLineFiles` turns a line's own `files` into `file` items `by: "line"`, seeded into `start` before the caller's own start items, which win on a name clash.
- `rows.ts`, `sql.ts` and `open-visit.ts` are the row mapping, the mutation and query SQL, and resolution-at-open behind the store. The SQL includes `blobHashesExist`, checked against a line's `files` before a run starts on them. Resolution-at-open covers the station, the agent definition and repo variant, needs, conversation continuation, failure context, deadline and dispatch tags.
- `dispatch-brief.ts` has `DispatchBriefs.briefFor`: a visit's needs for a machine. Values come from the brief the visit froze. Files and git repos are placed from the bag through the node's `bind`, a git need at the sha the visit was promised.

### Blobs, records and costs

- `blobs.ts` has `BlobsStore`: `put` (content-addressed by sha256, idempotent, refuses over the 64 MB cap and never truncates), `get`, and `reapUnreferenced`, which deletes and returns every hash no start item, produced item or `sessionRef` still names.
- `records.ts` has `RecordsStore`, a visit's own `log`/`turn`/`llm_call` trail over `station_run_records`. `append` assigns each record the next `seq` for its own (visit, kind), one insert per kind inside one transaction. An advisory lock (`pg_advisory_xact_lock` on the visit) serializes concurrent appends. It refuses a body over 64 KB with a `Refusal` and never truncates. `list` pages forward by `seq` (`{ after, limit }` in, `{ items, nextCursor }` out).
- `costs.ts` has `CostsStore.summary`: cost and tokens in and out summed in SQL over `llm_call` records, joined to `station_runs`, `assembly_runs` and `definitions` for repo, line, station and model. It groups by day, line, station or model, and filters by any of repo/line/station/since/until. A visit counts as missing cost when it has an agent definition hash and a report but no `llm_call` record with a numeric `costUsd`.

## Testing

The tests use real Postgres, not a fake. `FOR UPDATE SKIP LOCKED` has no meaningful in-memory stand-in, and a queue's correctness lives in the SQL. One command stands up a dedicated container, separate from any other Postgres you run locally.

```
npm run db:up      # from the repo root; floor-postgres on :5433
npm test -w @floor/store
```

The suites run in their own database, `floor_test`, created on first use. Every suite truncates its tables between tests, which on the database a floor is running against would delete its runs from under it. `FLOOR_TEST_DATABASE_URL` overrides the default `postgres://postgres:floor@localhost:5433/floor_test`.
