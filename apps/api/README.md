# @floor/api

The Floor's HTTP API (docs/api_sketch.md), a thin hapi layer over `@floor/store`. It holds no provider client. Every worker (the cluster agent, a service station) pulls its own work from `/events/claim`.

## Where this fits

This is the centre, and the only process that touches Postgres. It links [`@floor/store`](../../packages/store/README.md) and, through it, [`@re-cinq/floor-assembly-lines`](../../packages/assembly-lines/README.md). The cluster agent, every service worker, lore and the CLIs reach a floor only through the routes here.

One process does two jobs. It serves every request, on every replica. It also runs the loop that routes events, opens visits, enqueues dispatches and sweeps what has timed out. The loop runs only on the one replica holding a Postgres advisory lease, and every replica keeps serving.

See [the map](../../README.md) for the whole path an event takes.

## What is here

- **Auth** (`auth.ts`, `visit-token.ts`) is one bearer scheme. A token equal to `FLOOR_SERVICE_TOKEN` is a service. Anything else is checked as a visit token, an HMAC over `visitId.expiry` signed with `FLOOR_VISIT_TOKEN_SECRET`, so verifying one needs no database lookup. Human sessions are not implemented. A route is a service's alone unless it says otherwise. A visit token is held by an agent in a pod, so it reaches ten routes and no more: `/station-runs/:id/brief`, `/sink`, `/git-credential` and `/records`, `/conversations/:id`, `/blobs`, and `POST /events` for its own report. A route opens itself to visits with `options: { auth: VISITS_TOO }`. One that does not is closed to them, so a route added later is closed without being told to be. `visit-scope.test.ts` walks every route the server has with a visit's token, and an eleventh open route fails it. What hapi refuses by itself, a missing token or a route out of scope, is answered as a problem document too (`registerProblemResponses` in `problem.ts`).
- **Health** (`routes/health.ts`) is `/healthz`, `/readyz` and `/version`. `/readyz` asks whether it can reach Postgres, on a connection of its own so it never queues behind requests, and every replica that can, serves. `/version` gives the build sha, the schema version, whether this instance runs the loop, and each live cluster's agent build and agent subsystem as it last registered them.
- **Definitions** (`routes/definitions.ts`, `routes/start.ts`) are the same CRUD shape for `/assembly-lines`, `/stations` and `/agent-definitions`: list latest, get, versions, one version by hash, create, new version, archive. `/assembly-lines/:id/start` is here too. An assembly line refuses to archive while it has open runs.
- **Runs** (`routes/runs.ts`) are `/assembly-runs` list (at least one filter required), get (with its bag) and cancel.
- **The live channel** (`live/live-socket.ts`, `live/run-feed.ts`) is `GET /assembly-runs/:id/live?after=<seq>`, a WebSocket taken up on hapi's own listener with the `ws` package, so it is on the API's port and in no route table. One connection is one run. It replays the run's journal from the cursor, says `caught_up`, then sends each record, visit and settling as it is written, through whichever replica. Only the service token watches. A refusal is a close code (4401, 4404, 4400, 4429), and a settled run closes with 1000. A viewer too slow to be sent more, or silent to a ping, is dropped. What a viewer says is answered `unsupported`. The limits are `Config.live`, and the frames are in `docs/api_sketch.md`, "Live".
- **Station runs** (`routes/station-runs.ts`) are `/station-runs` list (run required, node and open filtered in memory) and get. A report itself still arrives as an event. `/station-runs/:id/records` takes a post of one or more records (`kind`/`body`/`occurredAt`, refused past `RecordsStore`'s 64 KB cap) and a get (`kind` required, `since`/`limit` page forward by `seq`). A visit token may only touch its own visit.
- **The executor's surface** (`routes/sink.ts`, `engine/sink.ts`, `engine/sink-event.ts`) is two routes. `/station-runs/:id/brief` is the visit's frozen brief again, structured for a machine: each need with its kind, path and access, the resolved settings, and a freshly minted visit token. `/station-runs/:id/sink` takes what the ai-agent-subsystem's supervisor posts, one enveloped event per request. A Claude stream line becomes a `turn` record, the result line an `llm_call` record with its cost, and an uploaded file a produced item. The lifecycle event that ends the visit becomes its `station_run.reported`, once.
- **The git credential broker** (`routes/git-credential.ts`, `git-grant.ts`, `git-provider.ts`) is `POST /station-runs/:id/git-credential`, which git's credential helper in a pod calls with the visit token and `{ repo: "owner/name" }`. The floor grants it for a repository the visit has a `git` need for, with the access the need declares, until the visit reports. It mints nothing itself. It asks the provider at `FLOOR_GIT_CREDENTIAL_URL`, presenting its own `FLOOR_GIT_CREDENTIAL_TOKEN`, never the service token. The floor refuses to start with the URL and no token. With no provider it answers 501, and refuses the brief of a visit that would write to a repository.
- **Conversations** (`routes/conversations.ts`): `POST /conversations/:visitId` saves a visit's archive as a blob. `GET /conversations/:visitId` restores it, for a service or for the one visit opened to continue it.
- **Blobs** (`routes/blobs.ts`) are `/blobs/:hash` get and `/blobs` post (raw bytes, capped at `BlobsStore`'s limit). A visit's token reads the files the visit was given and the ones it has uploaded, and any other answers 404. Hourly (`FLOOR_REAP_MS`) the loop reaps blobs nothing names once they are a day old, and in the same pass deletes the non-`internal.*` events of runs that settled over 30 days ago.
- **Events** (`routes/events.ts`) are the queue surface: get, the feed, post, `/events/claim`, ack and fail. The feed is `GET /events`, with at least one of `since`/`name`/`run`/`station-run` required and `limit` default 50, max 200. It pages forward by `since`. A visit token may only post `station_run.reported`, for its own visit. `/events/claim` is for workers, by tag, restricted to `station_run.dispatch`/`abort`.
- **The dispatcher** (`engine/route.ts`, `engine/dispatcher.ts`) is the body of the floor's own loop. `tick()` claims every event that is not a worker's and turns each into one store call. A node's start event opens its visit, at the walk's iteration, or by hand when a person or an outside system posted it. `station_run.reported` writes the report. Any other event is from outside. If it names a run (by `runId`, or by `subjectKey` and `repo`), that run's waiting nodes take it as their answer. Then every assembly line declaring it under `start.on` is started. A schedule's tick enqueues the schedule's next occurrence before any of that, so a tick that is refused does not stop the schedule. A `Refusal` from the store dead-letters the event, and fails the run when the node it could not open would otherwise leave the run waiting forever. Any other error is retried with backoff.
- **The sweeper** (`engine/sweep.ts`): `sweep()` fails every visit past its deadline with `outcome: "failed"` and `error: "timeout"`. A human visit has no deadline, so it never sweeps. `sweep()` also fails the visit of every `station_run.dispatch` no worker claimed in 30 minutes, naming the unoffered tags, then dead-letters the event. A `Refusal` from the store means someone else already reported the visit, and the sweep skips it.
- **The loop** (`engine/loop.ts`) runs the dispatcher and the sweeper on the one instance holding the floor's lease, a Postgres advisory lock. Each pass first checks the lease is still alive, since Postgres drops it silently with the connection. A pass that throws is logged and tried again. `stop()` waits for the pass in flight and releases the lease, so another instance takes over at once. An instance without the lease still serves the API.
- **Validation** (`schemas.ts`, `parse.ts`) is zod mirrors of `@floor/store`'s definition bodies. `parseBody` collects every error, not only the first.
- **Errors** (`problem.ts`) are RFC 9457 `application/problem+json`.
- **Costs** (`routes/costs.ts`) is `GET /costs`, a service's alone like every route that does not say otherwise. At least one of `repo`/`line`/`station`/`since`/`until` and a `group` (`day`/`line`/`station`/`model`) are required. It returns cost, tokens in and out, visit count and visits missing cost, per `CostsStore.summary`.

## Not yet here

Human sessions and their pages.

## Running

```
npm run db:up
npm run build
FLOOR_SERVICE_TOKEN=dev FLOOR_VISIT_TOKEN_SECRET=dev npm start -w @floor/api
```

`FLOOR_POLL_MS` (default 500) is how long the loop rests when the queue is empty. `FLOOR_SWEEP_MS` (default 30000) is how often it looks for overdue visits.

`scripts/walk.sh` boots the floor and walks one run end to end over HTTP. It puts a service station and an assembly line, starts a run, claims the dispatch as that station's worker, reports, and waits for the run to settle.

## Testing

The tests use real Postgres and a real hapi server through `server.inject()`. `test-server.ts` builds one server per test file, migrated once and truncated between tests. They use the same container as the rest of the workspace, in its own `floor_test` database (`FLOOR_TEST_DATABASE_URL` overrides it), so a suite never truncates the tables of a floor you have running.

```
npm run db:up
npm test -w @floor/api
```
