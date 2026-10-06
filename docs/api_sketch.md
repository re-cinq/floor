# Floor API sketch

Vocabulary from lore ADR-024: Factory ⊃ Floor ⊃ AssemblyLine ⊃ Station ⊃ Agent.
The model behind these endpoints is in [assembly_run_storage.md](assembly_run_storage.md);
each entity has its own page under [entities/](entities/).

## Conventions

- **The floor holds no provider client.** No Kubernetes, no GitHub, no chat.
  It owns the queue, the store and this API. Everything that touches a
  provider is a station.
- **The floor never calls out.** Every worker, cluster agent or service,
  pulls its work from the queue. There is no outbound HTTP from the floor.
- **Auth.** Services present a bearer token. Humans present a session, which
  carries the repos they may act on. A station presents the **visit token**
  minted when its station run opened: scoped to that visit, expiring at its
  deadline, good for reading its brief and its needs' blobs, writing its
  produces' blobs, its records and its report, and trading for a git
  credential when a need declares write access. A human session on the
  visit's repo satisfies the same check for a human visit. *Human sessions
  are not built yet: a person acts through the service token.*
- **A route is a service's alone unless it says otherwise.** A visit token
  is held by an agent in a pod, so it reaches ten routes and no more: its
  brief, its sink, its git credential, its records, its conversation, and
  blobs, all under `/station-runs/:id`, `/conversations/:id` and `/blobs`,
  and `POST /events` for its own report. Every other route answers it 403,
  and a route added later is closed to it without being told to be.
- **Errors.** RFC 9457 problem details, `application/problem+json`. A refused
  write returns 409 and names the resource holding it in `detail`.
- **Pagination.** Every list takes `limit` (default 50, max 200) and an
  opaque `cursor`, a string to hand back unchanged. The run list is ordered
  newest first on `(created_at, id)` and its cursor holds both, so a page
  never repeats or skips a run; a cursor the floor did not return is 400.
  Lists marked *filter required* return 400 without one. *Built for runs,
  records and the events feed; the other lists return everything.*
- **Creates are idempotent by their natural key**, not by a header. A run by
  its subject, a definition and a blob by their content hash, an event by
  its `dedupe_key`. Repeating a create returns what already exists.
- **Type safety.** Definitions, run arguments and event payloads are typed
  schemas. A failing POST returns 400 with every error, not the first. An
  assembly line is also checked for what it refers to: entry, exit and every
  edge name a real node, every node but the exit and the fail node has an
  outgoing edge, and every node's station is a known one. A line may name a
  `fail` node beside its `exit`: a run arriving there settles as `failed`.
- **Field names.** Request and response bodies are `camelCase`: `runId`,
  `dedupeKey`, `availableAt`, `startItems`.
- **Tenancy is the database.** One floor serves one tenant. Lore gives each
  team its own schema; standalone has one. No row carries a tenant column.
- **Size bounds.** A `value` item is at most 4 KB, a brief at most 64 KB; a
  blob at most 64 MB, a conversation archive at most 256 MB, a record at
  most 64 KB. Over the bound is refused with a named error, never truncated.
  *The bounds on a value item and on a brief are not enforced yet, except
  for a value rendered from a template.*

## Health and version

GET    /healthz                          // process up
GET    /readyz                           // can reach its database; 503 otherwise. Every such instance serves
GET    /version                          // build sha, schema version, and whether this instance runs the loop

## Metrics

GET    /metrics                          // unauthenticated, like /healthz; Prometheus text exposition (`text/plain; version=0.0.4`), scraped by Google Managed Prometheus

Every number is a fresh query against `assembly_runs`/`station_runs`/`events`, never a per-process counter — two api
replicas would each only see their own traffic, and the tables are the shared source of truth:

- `floor_runs_open` — `assembly_runs` with no `finished_at` yet
- `floor_runs_settled_total{outcome="..."}` — settled runs grouped by outcome, as of this scrape (a gauge snapshot of a total, not a monotonic counter)
- `floor_visits_open` — `station_runs` with no `report` yet
- `floor_visits_overdue` — open visits past their `deadline`
- `floor_events_queue_depth` — events not yet acked, dead, or dropped (the `events_claimable` condition)
- `floor_events_dead_total` — events with a `dead_at`
- `floor_loop_holds_lease` — 1 if this replica runs the floor's loop, else 0

## Assembly lines - blueprints for assembly runs

GET    /assembly-lines                   // filter on name
GET    /assembly-lines/:id               // latest version, including its argument schema and start events
GET    /assembly-lines/:id/versions      // every version, newest first
GET    /assembly-lines/:id/versions/:hash // one immutable version
POST   /assembly-lines                   // create a line (first version); 400 with all definition errors
PUT    /assembly-lines/:id               // does NOT mutate; creates a new version, returns its hash
DELETE /assembly-lines/:id               // archives; 409 while runs are open on it

POST   /assembly-lines/:id/start         // body: startItems, optional repo, optional entry, optional lineHash (a version of the
                                         // line; absent means the latest). 201, or, if an open run already holds the
                                         // subject, that run (200, joined: true). `repo` may be left out for a line with
                                         // no `git` argument, and the run then has none (`repo: null`); a line with a
                                         // `git` argument is refused without it, 400, as is an empty `repo`. 400 naming every arg the line declares
                                         // that startItems lacks or holds as another kind, or a lineHash that is not a
                                         // version of the line, or names a version of an archived line; a start item
                                         // the line does not declare is kept

A run is also started by an **event**, when the line declares `start.on`.
That is how a PR opening starts a review and a schedule starts a sweep.

**When a run has a repo.** A run's repo is the one its line's `git` argument
names; else the one the start names (`repo` in the body, `repo` or
`repository` in an event's payload); else none, and the run's `repo` is
null. So a schedule whose payload names no repo starts a line that has no
`git` argument, and that is all a tick that fans out needs: its one service
station starts the runs that are due.

## Assembly runs - one execution of a line, walked on events

GET    /assembly-runs                    // filter required: line, open, repo, withoutRepo, subject, since (a created_at floor); newest first on (created_at, id),
                                         // `withoutRepo=true` lists the runs that have no repo, and is refused together with `repo`;
                                         // each run with its createdAt; `cursor` is opaque, and one that is not a cursor this returned is 400
GET    /assembly-runs/:id                // run + bag + currentNode (the open visit's node, else the last opened; null) + cost (null if nothing counted)
POST   /assembly-runs/:id/cancel         // settles the run as cancelled, drops its queued events, aborts open visits

// its visits:  GET /station-runs?run=:id        its events:  GET /events?run=:id
// watching it as it happens:  GET /assembly-runs/:id/live, a WebSocket, below
// retrying a failed node, or starting a node by hand, is posting that node's start event with the run id;
// on a finished run that reopens it, unless another open run holds its subject. A subject finds open runs only
// no POST, PUT or DELETE: runs are created by start, and they are an audit trail

## Live - one run, watched as it happens

A WebSocket. One connection is one run: there are no channels and nothing
to subscribe to. lore opens one when somebody subscribes to a run in its
own UI, relays what arrives, and closes it when they unsubscribe. A browser
never reaches the floor.

GET    /assembly-runs/:id/live?after=<seq>   // upgrade. The service token, as `Authorization: Bearer`

The floor replays the run's journal from `after`, 0 or absent for its
start, says `caught_up`, and then sends what happens as it happens. `seq`
numbers everything in one run 1, 2, 3, with no gap. A viewer that lost its
connection comes back with the last `seq` it saw and misses nothing.

```
floor sends    { type: "record",         seq, visitId, nodeId, iteration, record }   // a log, turn, llm_call or produced
               { type: "visit_opened",   seq, visit }                                // as GET /station-runs/:id, no report yet
               { type: "visit_reported", seq, visit }                                // the same visit, with its report
               { type: "run_settled",    seq, run }                                  // the last, then 1000
               { type: "run_reopened",   seq, run }                                  // a start by hand reopened it: what follows a settling
               { type: "caught_up",      seq }                                       // once: the replay is over
               { type: "unsupported" }                                               // to whatever a viewer says

floor closes   1000   the run settled, now or before it was watched, and the journal ends there
               1001   the floor is stopping: come back with your cursor
               1011   the floor could not read the run: come back with your cursor
               4400   `after` is not a whole number
               4401   no service token. A visit token is refused too: a pod does not watch runs
               4404   no such run
               4429   the run has all the viewers it may, 16
lore closes    at any time: that is the unsubscribe
```

- A refusal is a close code and not a status. The upgrade is taken up
  first, since a close code is read by every client and a refused
  upgrade's status by few.
- A `session` record, where a conversation was saved, is not sent.
- A viewer that reads slower than its run writes is dropped without a close
  code, once 4 MB wait for it. It sees 1006 and comes back with its cursor.
- The floor pings every 25 seconds, and drops a viewer that did not answer
  the ping before.
- What a viewer says is answered `unsupported`. The way in is kept for a
  person's word to a running agent, so giving it a meaning later changes
  nothing here.
- Every replica serves viewers, whichever of them wrote what is sent.
- `node scripts/watch-run.mjs <floor url> <run id> [after]` is a viewer for
  a terminal, a line a frame, with `FLOOR_SERVICE_TOKEN` in its environment.
  `scripts/walk-agent.sh` watches its own run with it, and fails when it was
  sent no turn or no settling.
- A run settled before the floor kept a journal replays nothing and closes
  with 1000. Its visits and records are read over HTTP, as before.

## Live - the whole floor, by id

A second WebSocket, for a list of runs that stays true without being read
again and again. It says which run started and which run changed, and
nothing of what happened in it: whoever hears a run's id reads that run.
lore opens one when the first person looks at its list of runs and closes
it when the last one leaves.

GET    /assembly-runs/live                   // upgrade. The service token, as `Authorization: Bearer`

```
floor sends    { type: "resync" }                 // first, once the floor listens; and after any gap: read the list again
               { type: "run_started", runId }     // a run was created
               { type: "run_changed", runId }     // a visit opened, a visit reported, the run settled or reopened
               { type: "unsupported" }            // to whatever a viewer says

floor closes   1001   the floor is stopping: come back
               4401   no service token
lore closes    at any time: that is the unsubscribe
```

- There is no cursor. What was missed while away is not replayed: every
  connection opens with `resync`, and the list is read again.
- A record is never announced here. A run that writes a thousand turns
  says nothing on this socket until its visit reports.
- Nothing is filtered by run. lore is the one viewer, and a floor's visits
  open and report a few times a minute, not a few times a second.

## Station runs - a single visit to a station inside a run

Read-only. A visit is open until its one report arrives, and the report
arrives as an event: `station_run.reported`, posted to `/events` with the
visit token.

GET    /station-runs                     // run required; node, station, open and since (an opened_at floor) narrow it
GET    /station-runs/:id                 // the visit + outcome + worker + deadline, and `cost`: what its agent counted and
                                         // what that cost, model by model; null for a visit nothing was counted for
GET    /station-runs/:id/brief           // for the executor: the visit's `runId`, `lineId` and `nodeId`, each need with its kind, path
                                         // and access, the resolved settings, and a freshly minted visit token. 409 once the visit is done
POST   /station-runs/:id/git-credential  // { repo: "owner/name" }, visit token -> { username, password } for a repository
                                         // the visit has a git need for, read or write as the need declares. 403 for
                                         // any other repository, 501 on a floor with no provider, 502 when it refuses.
                                         // The provider is asked with `FLOOR_GIT_CREDENTIAL_TOKEN`, never the service token

The data plane, written with the visit token, never through the queue:

POST   /station-runs/:id/records         // batch of records, each with a kind (log | turn | llm_call) and a body
GET    /station-runs/:id/records         // filter required: kind; optional since (cursor), to follow a visit live
POST   /station-runs/:id/sink            // one event of the ai-agent-subsystem's supervisor per request, in its
                                         // `{source, event}` envelope. Turns and cost become records; file events
                                         // become produced items; the event ending the visit is enqueued as
                                         // `station_run.reported`, once. 409 for a visit already done.

What else an agent pod calls, because the subsystem requires it:

GET    /skills/settings.json             // the agent's settings, fetched by the pod's init with no credential
POST   /conversations/:visitId           // body: the archive (gzip); saved as a blob, noted on the visit. Visit token
GET    /conversations/:visitId           // the archive that visit saved; for a service, or the visit continuing it

The floor's `/skills` is the registry of last resort: it keeps an agent
alive and serves no skills. A definition that names skills names where they
are, in `config.skills_source`.

## Stations - the registry a line node points at

A station is its **kind**, what it **needs** and **produces**, the
**outcomes** it can report, and for the agent kind a reference to an
**agent definition**. Kinds: `agent`, `service`, `human`. A node that names
no station is a marker.

GET    /stations                         // filter on kind, name
GET    /stations/:id                     // latest version
GET    /stations/:id/versions
GET    /stations/:id/versions/:hash
POST   /stations
PUT    /stations/:id                     // new version
DELETE /stations/:id                     // archives; versions a visit references are retained

## Agent definitions - model, prompt, timeout, image, tags, with repo variants

GET    /agent-definitions                // filter on name
GET    /agent-definitions/:id            // latest version
GET    /agent-definitions/:id/versions
GET    /agent-definitions/:id/versions/:hash
POST   /agent-definitions
PUT    /agent-definitions/:id            // new version
DELETE /agent-definitions/:id            // archives; 409 while a station's latest version references it

## Migrations - the pipeline files that ran

GET    /migrations                       // service token only
GET    /migrations/:name                 // the sha256 the file ran as; 404 for one that has not run
PUT    /migrations/:name                 // { sha256 }. 409 for a name that ran as other content: a file runs once

The floor applies no file itself. `floor-pipeline migrate` (@re-cinq/floor-pipeline) does, through the routes above
and the ones any client uses, and the floor remembers.

## Costs - collected by the floor for every visit

GET    /costs                            // service token only. filter required: run, repo, line, station, since, until; group required: day | line | station | model | run
                                         // returns cost, tokens in and out, visit count, visits with missing cost, and the models
                                         // that had no price. `model` is the model that did the work: the one an agent was given,
                                         // and any it called on the side

## Blobs - content-addressed bytes behind every `file` item

GET    /blobs/:hash                      // 404 unless the caller's token covers this hash: a service reads any, a
                                         // visit the files it was given and the ones it has uploaded
POST   /blobs                            // body bytes; returns the sha256; 413 above the cap

## Events - the queue that drives everything

GET    /events                           // at least one of since (cursor), name, run, station-run required.
                                         // Poll it, no SSE
GET    /events/:id
POST   /events                           // body: name, payload, optional dedupeKey, availableAt, runId. A payload
                                         // naming a run does so by `runId`, or by `subjectKey` and `repo`
                                         // (a `subjectKey` alone names a run that has no repo).
                                         // A visit token may post only `station_run.reported`, for its own visit.
                                         // A report is stamped with the run of the visit it names

Workers pull. Opening a visit for an agent or service station enqueues
`station_run.dispatch`; a visit ending, for any reason, enqueues
`station_run.abort` for the worker that claimed it.

POST   /events/claim                     // body: tags, limit; returns dispatch and abort events whose tags the caller offers
POST   /events/:id/ack
POST   /events/:id/fail                  // body: error, permanent; requeues with backoff, or dead-letters

## Schedules - predefined events on a cadence

A schedule is a name, a cron and an event payload, and holds exactly one
pending event. Handling its tick enqueues the next occurrence first, and
only then starts what the tick starts: an assembly line that declares
`start.on: schedule.<name>.tick`. So a schedule outlives a refused tick. A
tick whose assembly line cannot start (a `start.args` template the payload
cannot fill, an argument the line does not declare) is dead-lettered with
the refusal as its `lastError`, and costs that tick alone: the next
occurrence is already pending. A tick retried after any other error
enqueues nothing twice, since an occurrence is one event by its dedupe key.
Service token only.

GET    /schedules
GET    /schedules/:id                    // includes the pending event's availableAt
POST   /schedules                        // enqueues the first occurrence
PUT    /schedules/:id                    // updates the one pending event
DELETE /schedules/:id                    // drops the one pending event
POST   /schedules/:id/trigger            // enqueue one extra instance now

## Compatibility with lore

Goal: run standalone, run lore's lines, and slot into lore's sibling
services without changing this API.

| concern | contract kept | standalone | inside lore |
|---|---|---|---|
| transition replay | lore's `getNextTransition`, ported into `@floor/assembly-lines` | the port | the port |
| line definitions | **converted**, see below | this floor's schema | converter output, checked in |
| station contract | outcome vocabulary, `(run, node, iteration)`, `LORE_NODE_RESULT:` / `REVIEW_RESULT:` in agent output | same | same |
| agent pods | the ai-agent-subsystem: an `Agent` resource per visit | one cluster agent on minikube | cluster agents per cluster, claiming by tag |
| events queue | names, `dedupe_key`, `not_before`, claim/ack | own table | proxy to event-router |
| GitHub's events | `github.<event>.<action>`, fields lifted to the top | lore's webhook handler, posting to `/events` | lore's own webhook handler, posting the same events |
| git credentials | the subsystem's broker: git in the pod trades its run credential for a repo-scoped token, minted when it asks | the floor's own endpoint, asking the provider at `FLOOR_GIT_CREDENTIAL_URL` with `FLOOR_GIT_CREDENTIAL_TOKEN` | lore's `POST /api/github-credentials` |
| agent output | `LORE_NODE_RESULT:`, then `REVIEW_RESULT:`, then success | lore's parser, ported; outcomes are the station's own | same |
| tasks | none; `task_id` is an ordinary run argument | none | lore creates the task, starts the run, settles the task on `internal.run.settled`, which carries the run's value arguments in `args`, `task_id` among them |
| live view | one WebSocket a run, `GET /assembly-runs/:id/live`, the service token | any WebSocket client | lore-api relays it over the socket its browser already has, opened on subscribe and closed on unsubscribe |
| live list of runs | one WebSocket for the floor, `GET /assembly-runs/live`, ids only, the service token | any WebSocket client | lore-api keeps one while somebody looks at its run list, and tells each browser of the runs on its page |
| agent context | none required | whatever the definition names | lore MCP gateway |

**The converter is a deliverable**, `@floor/lore-converter`. It reads each
lore line and emits this floor's lines, stations and agent definitions.
Every one of lore's lines converts into a line this floor accepts. One,
`code-review`, runs as it did in lore. For the others the converter says
what is left: mostly what starts them, which is in lore's code and not in
its files, and what their service stations read and write.

| lore | becomes |
|---|---|
| node `prompt_ref` + `model` | one agent definition per distinct pair; one station per distinct `(station_ref, agent definition)` |
| `continues: {node, key}` | station `conversation: continue`, `conversation_key` |
| `by_hand: true` | node `start: manual.<line>.<node>` |
| terminal `retrospective` | a node with no station |
| `job_ref` nodes | `service` stations named after the job |
| recipe `inputs`, `watch` | `file` needs and produces |
| what an agent prints for the next step to read | a `file` produce, `from: output` |
| `route: {args.x}` | human station route over declared needs |
| Floor hook `stampLinePr` | a service node `open-pr` after the push node |
| Floor hook `maybeMarkPrReady` | a service node `mark-ready` before a human PR node |
| Floor hooks `postReviewFromNode`, `postReplyFromNode` | service nodes `post-review`, `post-reply` after the review and refine nodes |
| Floor hooks at line finish (check run, failure notice, task settle, episode) | lines with `start.on: internal.run.settled` |
| every `assemblyRuns.start` call site (PR opened, merged, cron, triage) | `start.on` on the line |
| single-CR task types | a one-node line |

The lines whose stations read lore's database run only inside lore.
