# @floor/api

The Floor's HTTP API (docs/api_sketch.md): a thin hapi layer over `@floor/store`. Holds no provider client — every worker (the cluster agent, a service station) pulls its own work from `/events/claim`.

## What is here

- **Auth** (`auth.ts`, `visit-token.ts`): one bearer scheme. A token equal to `FLOOR_SERVICE_TOKEN` is a service; anything else is checked as a visit token, an HMAC over `visitId.expiry` signed with `FLOOR_VISIT_TOKEN_SECRET` — no database lookup to verify one. Human sessions are not implemented.
- **Health** (`routes/health.ts`): `/healthz`, `/readyz` (probes the pool), `/version`.
- **Definitions** (`routes/definitions.ts`, `routes/start.ts`): the same CRUD shape for `/assembly-lines`, `/stations`, `/agent-definitions` — list latest, get, versions, one version by hash, create, new version, archive — plus `/assembly-lines/:id/start`. A line refuses to archive while it has open runs.
- **Runs** (`routes/runs.ts`): `/assembly-runs` list (at least one filter required), get (with its bag), cancel.
- **Station runs** (`routes/station-runs.ts`): `/station-runs` list (run required; node/open filtered in memory) and get. Read-only — a report arrives as an event.
- **Blobs** (`routes/blobs.ts`): `/blobs/:hash` get, `/blobs` post (raw bytes, capped at `BlobsStore`'s limit).
- **Events** (`routes/events.ts`): the queue surface — get, post (a visit token may only post `station_run.reported`, for its own visit), `/events/claim` (workers, by tag, restricted to `station_run.dispatch`/`abort`), ack, fail.
- **The dispatcher** (`engine/route.ts`, `engine/dispatcher.ts`): the body of the floor's own loop. `tick()` claims every event that is not a worker's and turns each into one store call: a node's start event opens its visit (at the walk's iteration, or by hand when a person or an outside system posted it), `station_run.reported` writes the report. Any other event is from outside: if it names a run (by `runId`, or by `subjectKey` and `repo`), that run's waiting nodes take it as their answer; then every line declaring it under `start.on` is started. A `Refusal` from the store dead-letters the event, and fails the run when the node it could not open would otherwise leave the run waiting forever; any other error is retried with backoff.
- **The sweeper** (`engine/sweep.ts`): `sweep()` fails every visit past its deadline (`outcome: "failed"`, `error: "timeout"` — a human visit has no deadline, so it never sweeps) and every `station_run.dispatch` no worker claimed in 30 minutes (fails its visit naming the unoffered tags, then dead-letters the event). A `Refusal` from the store means someone else already reported the visit; the sweep skips it rather than throwing.
- **Validation** (`schemas.ts`, `parse.ts`): zod mirrors of `@floor/store`'s definition bodies; `parseBody` collects every error, not just the first.
- **Errors** (`problem.ts`): RFC 9457 `application/problem+json`.

## Not yet here

Nothing runs the dispatcher or the sweeper yet: the process does not take the single-instance lease or tick either on a timer, so over HTTP a started run still waits and a deadline still passes unswept. Also: the richer machine-facing `/station-runs/:id/brief` and `/station-runs/:id/sink` the cluster agent's `floor-client.ts` expects, `/station-runs/:id/git-credential`, `/station-runs/:id/records`, schedules, and costs.

## Running

```
npm run db:up
FLOOR_SERVICE_TOKEN=dev FLOOR_VISIT_TOKEN_SECRET=dev npm run dev -w @floor/api
```

## Testing

Real Postgres, real hapi server via `server.inject()` (`test-server.ts` builds one server per test file, migrated once, truncated between tests). Same container as the rest of the workspace:

```
npm run db:up
FLOOR_DATABASE_URL=... npm test -w @floor/api
```
