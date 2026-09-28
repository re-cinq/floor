# @floor/api

The Floor's HTTP API (docs/api_sketch.md): a thin hapi layer over `@floor/store`. Holds no provider client — every worker (the cluster agent, a service station) pulls its own work from `/events/claim`.

## What is here

- **Auth** (`auth.ts`, `visit-token.ts`): one bearer scheme. A token equal to `FLOOR_SERVICE_TOKEN` is a service; anything else is checked as a visit token, an HMAC over `visitId.expiry` signed with `FLOOR_VISIT_TOKEN_SECRET` — no database lookup to verify one. Human sessions are not implemented.
- **Health** (`routes/health.ts`): `/healthz`, `/readyz` (probes the pool), `/version`.
- **Definitions** (`routes/definitions.ts`, `routes/start.ts`): the same CRUD shape for `/assembly-lines`, `/stations`, `/agent-definitions` — list latest, get, versions, one version by hash, create, new version, archive — plus `/assembly-lines/:id/start`. A line refuses to archive while it has open runs.
- **Runs** (`routes/runs.ts`): `/assembly-runs` list (at least one filter required), get (with its bag), cancel.
- **Station runs** (`routes/station-runs.ts`): `/station-runs` list (run required; node/open filtered in memory) and get; a report itself still arrives as an event. `/station-runs/:id/records` post (`kind`/`body`/`occurredAt`, one or more; refused past `RecordsStore`'s 64 KB cap) and get (`kind` required, `since`/`limit` page forward by `seq`) — a visit token may only touch its own visit.
- **The executor's surface** (`routes/sink.ts`, `engine/sink.ts`, `engine/sink-event.ts`): `/station-runs/:id/brief` is the visit's frozen brief again, structured for a machine: each need with its kind, path and access, the resolved settings, and a freshly minted visit token. `/station-runs/:id/sink` takes what the ai-agent-subsystem's supervisor posts, one enveloped event per request: a Claude stream line becomes a `turn` record, the result line an `llm_call` record with its cost, an uploaded file a produced item, and the lifecycle event that ends the visit becomes its `station_run.reported`, once. `/station-runs/:id/git-credential` answers 501 until a provider is configured.
- **Conversations** (`routes/conversations.ts`): `POST /conversations/:visitId` saves a visit's archive as a blob; `GET /conversations/:visitId` restores it, for a service or for the one visit opened to continue it.
- **Blobs** (`routes/blobs.ts`): `/blobs/:hash` get, `/blobs` post (raw bytes, capped at `BlobsStore`'s limit).
- **Events** (`routes/events.ts`): the queue surface — get, post (a visit token may only post `station_run.reported`, for its own visit), `/events/claim` (workers, by tag, restricted to `station_run.dispatch`/`abort`), ack, fail.
- **The dispatcher** (`engine/route.ts`, `engine/dispatcher.ts`): the body of the floor's own loop. `tick()` claims every event that is not a worker's and turns each into one store call: a node's start event opens its visit (at the walk's iteration, or by hand when a person or an outside system posted it), `station_run.reported` writes the report. Any other event is from outside: if it names a run (by `runId`, or by `subjectKey` and `repo`), that run's waiting nodes take it as their answer; then every line declaring it under `start.on` is started. A `Refusal` from the store dead-letters the event, and fails the run when the node it could not open would otherwise leave the run waiting forever; any other error is retried with backoff.
- **The sweeper** (`engine/sweep.ts`): `sweep()` fails every visit past its deadline (`outcome: "failed"`, `error: "timeout"` — a human visit has no deadline, so it never sweeps) and every `station_run.dispatch` no worker claimed in 30 minutes (fails its visit naming the unoffered tags, then dead-letters the event). A `Refusal` from the store means someone else already reported the visit; the sweep skips it rather than throwing.
- **The loop** (`engine/loop.ts`): runs the dispatcher and the sweeper on the one instance holding the floor's lease, a Postgres advisory lock. Each pass checks the lease is still alive first, since Postgres drops it silently with the connection; a pass that throws is logged and tried again. `stop()` waits for the pass in flight and releases the lease, so another instance takes over at once. `/readyz` is 503 on an instance that does not hold it.
- **Validation** (`schemas.ts`, `parse.ts`): zod mirrors of `@floor/store`'s definition bodies; `parseBody` collects every error, not just the first.
- **Errors** (`problem.ts`): RFC 9457 `application/problem+json`.

## Not yet here

A git credential provider, schedules, and costs. `GET /blobs/:hash` does not yet check that the caller's visit needs that blob, and nothing schedules the blob reaper.

## Running

```
npm run db:up
npm run build
FLOOR_SERVICE_TOKEN=dev FLOOR_VISIT_TOKEN_SECRET=dev npm start -w @floor/api
```

`FLOOR_POLL_MS` (default 500) is how long the loop rests when the queue is empty; `FLOOR_SWEEP_MS` (default 30000) is how often it looks for overdue visits.

`scripts/walk.sh` boots the floor and walks one run end to end over HTTP: it puts a service station and a line, starts a run, claims the dispatch as that station's worker, reports, and waits for the run to settle.

## Testing

Real Postgres, real hapi server via `server.inject()` (`test-server.ts` builds one server per test file, migrated once, truncated between tests). Same container as the rest of the workspace, in its own `floor_test` database (`FLOOR_TEST_DATABASE_URL` overrides it), so a suite never truncates the tables of a floor you have running:

```
npm run db:up
npm test -w @floor/api
```
