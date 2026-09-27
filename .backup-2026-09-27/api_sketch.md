# Floor API sketch

Vocabulary from lore ADR-024: Factory ⊃ Floor ⊃ AssemblyLine ⊃ Station ⊃ Agent.
The model behind these endpoints is in [assembly_run_storage.md](assembly_run_storage.md).

## Conventions

- **Auth.** Services present a bearer token. Humans present a session, which
  carries their team and the repos they may act on. A station, of any kind,
  presents the **visit token** minted when its station run opened: scoped to
  that run, expiring at its deadline, good for reading its brief, reading its
  needs' blobs, writing its produces' blobs, posting its report event,
  writing its records, and trading for a git credential when a need
  declares write access. A human session on the visit's team and repo
  satisfies the same check for a human-kind visit.
- **Errors.** RFC 9457 problem details, `application/problem+json`, with `type`,
  `title`, `status`, `detail`, `instance`. A refused write returns 409 and names
  the resource holding it in `detail`.
- **Pagination.** Every list takes `limit` (default 50, max 200) and `cursor`
  (opaque, encodes `(created_at, id)`). Lists are ordered by `created_at desc,
  id desc` so a cursor is stable. Responses carry `items` and `next_cursor`.
  Lists marked *filter required* return 400 without one.
- **Idempotency.** Every POST that creates accepts an `Idempotency-Key` header.
  A replay with the same key returns the original result and status. The HTTP
  layer owns this, not the handlers. Keys are stored with the response for 24h.
- **Type safety.** Line definitions, station definitions, run arguments and
  event payloads are typed schemas. A POST that fails validation returns 400
  with every error, not the first.
- **Tenancy.** Every row carries `team_id`. A caller only ever sees its team.
- **Size bounds.** A `value` item is at most 4 KB and a brief at most 64 KB;
  anything bigger must be a `file` item. A blob is at most 32 MB, a
  conversation archive at most 256 MB. Over the bound is refused with a named
  error, never truncated.

## Health and version

GET    /healthz                          // process up
GET    /readyz                           // holds the single-instance lease and can reach its dependencies
GET    /version                          // build sha, schema version

## Assembly lines - blueprints for assembly runs

A line is authored, versioned and content-hashed. A run references the
version it started from by `(line id, hash)`; the version is immutable.

GET    /assembly-lines                   // filter on name, tags, owner
GET    /assembly-lines/:id               // latest version, including its argument schema
GET    /assembly-lines/:id/versions      // every version, newest first
GET    /assembly-lines/:id/versions/:hash // one immutable version
POST   /assembly-lines                   // create a line (first version); 400 with all definition errors
PUT    /assembly-lines/:id               // does NOT mutate; creates a new version, returns its hash
DELETE /assembly-lines/:id               // archives; 409 while runs are active on it

POST   /assembly-lines/:id/start         // body: run arguments (validated against the schema);
                                         // creates a run from the latest version, or from body.version if pinned;
                                         // the argument marked `subject` in the schema sets the run's subject key;
                                         // optional body.entry starts at a node other than the line's entry
                                         // (validated: the node exists and its required needs are seeded)

A line version may ship files (`files:` in the definition, uploaded as blobs
first). They are seeded into the run's bag at start under the names given.

## Assembly runs - one execution of a line, walked on events

A run's state is its station runs. Nothing edits a run in place; the only
writes are actions.

GET    /assembly-runs                    // filter required: line, status, repo, subject, since
GET    /assembly-runs/:id                // run + line (id, hash) + current node + bag + cost (the sum over its visits)
GET    /assembly-runs/:id/station-runs   // every visit (run, node, iteration), ordered
GET    /assembly-runs/:id/events         // the run's events, ordered; the reconstruction feed for one run
POST   /assembly-runs/:id/cancel         // marks the run cancelled, drops its queued events, aborts open visits best-effort

// retrying a failed node, or starting a node by hand, is posting that node's start event to /events with the run id
// no POST: runs are created through /assembly-lines/:id/start
// no PUT / DELETE: runs are an audit trail, retained, not edited

## Station runs - a single visit to a station inside a run

Read-only over HTTP. A visit is open or done, and it becomes done through
exactly one event: the station posts `station_run.reported`, authenticated
by the visit token, and the loop applies it to the store.

GET    /station-runs                     // filter required: run, node, status, station, since
GET    /station-runs/:id                 // the visit + outcome + worker + deadline + cost (the sum of its llm_call records)
GET    /station-runs/:id/brief           // what the station is handed: resolved needs with URLs, produce slots; visit-token scoped
POST   /station-runs/:id/git-credential  // visit token -> a short-lived token scoped to the one repo of a git need declaring
                                         // `access: write`; 403 if no such need, 409 once the visit is done

Data plane: one kind of row, written by the station with the visit token, batched, never via events:

GET    /station-runs/:id/records         // filter required: kind (log | turn | llm_call); ordered
POST   /station-runs/:id/records         // batch; each record has a kind and a body

## Stations - the registry a line node points at

A station is a unit of work: its **kind**, what it **needs** and **produces**,
its **conversation mode**, and a reference to the **agent definition** that
holds model, prompt, timeout and image. Versioned and content-hashed like
lines; a visit records the station hash it resolved to.

Kinds, one list used everywhere: `agent`, `service`, `human`. A node that names no station is a marker. See entities/station.md for the interface.

GET    /stations                         // filter on kind, name
GET    /stations/:id                     // latest version
GET    /stations/:id/versions
GET    /stations/:id/versions/:hash
POST   /stations
PUT    /stations/:id                     // does NOT mutate; creates a new version, returns its hash
DELETE /stations/:id                     // archives; versions referenced by a visit are retained

## Agent definitions - model, prompt, timeout, image, with repo variants

Referenced by a station version by id. Versioned and content-hashed. A version
holds a default settings bundle and optional variants keyed by full repo
identity, `host/owner/name`; the run's repo selects the variant at visit open.

GET    /agent-definitions                // filter on name
GET    /agent-definitions/:id            // latest version
GET    /agent-definitions/:id/versions
GET    /agent-definitions/:id/versions/:hash
POST   /agent-definitions
PUT    /agent-definitions/:id            // new version
DELETE /agent-definitions/:id            // archives; 409 while a station version references it

## Costs - collected by the floor for every visit

GET    /costs                            // filter required: repo, line, station, since, until; group by day | line | station | model
                                         // returns cost, input and output tokens, visit count, and the count of visits with missing cost

## Blobs - content-addressed bytes behind every `file` item

GET    /blobs/:hash                      // 404 unless the caller's token or session covers this hash
POST   /blobs                            // body bytes; returns the hash; 413 above the cap

## Events - the queue that drives everything

Every state change in a run is an event: the walk posts a node's start event,
the executor posts the visit's report, a schedule posts a tick, a person posts
a manual start. The loop drains the queue and applies each event through the
store. See the storage doc for the row, the loop and the names.

GET    /events                           // filter required: since (cursor), name, run, station-run.
                                         // The floor-wide feed: poll with the cursor, no SSE
GET    /events/:id
POST   /events                           // enqueue one event; optional not_before; auth by service token, session, or visit token
                                         // (a visit token may post only station_run.reported for its own visit)

Dispatch is pull. Opening an agent visit enqueues `station_run.dispatch` carrying the
visit id and the station's tags. Cluster agents consume those through the same claim, ack and retry the floor's own loop uses:

POST   /events/claim                     // body: names, tags, limit; returns claimed events whose tags are a subset of the caller's
POST   /events/:id/ack
POST   /events/:id/fail                  // body: error, permanent; requeues with backoff, or dead-letters

## Schedules - predefined events on a cadence

A schedule is a named event payload plus a cron. It holds exactly one
future-dated event at any time. When that event is acked, its handler
enqueues the next occurrence, so the loop never knows a schedule exists and
there is no materialiser.

GET    /schedules
GET    /schedules/:id                    // includes the pending event's not_before
POST   /schedules                        // body: name, cron, event payload (typed); enqueues the first occurrence
PUT    /schedules/:id                    // updates the one pending event
DELETE /schedules/:id                    // drops the one pending event
POST   /schedules/:id/trigger            // enqueue one extra instance now

## Compatibility with lore

Goal: run standalone, but run lore's lines, speak lore's station contract and
slot into lore's sibling services without changing this API. Everything lore
supplies from outside is a port with two adapters.

| concern | contract kept | standalone adapter | lore adapter |
|---|---|---|---|
| transition replay | `getNextTransition` from `@re-cinq/lore-assembly-lines`: outcomes, edges, `iteration_max` | same lib | same lib |
| line definitions | **converted**, see below | this floor's schema | converter output, checked in |
| station contract | `LORE_NODE_RESULT:` / `REVIEW_RESULT:` markers, outcome vocabulary, `(run, node, iteration)` | same | same |
| events queue | names, `not_before`, claim/ack | own table, drained in-process | proxy to event-router claim/ack; ai-agent-subsystem posts terminal events there |
| station execution | claim `station_run.dispatch`, create the pod, run the wrapper | one cluster agent, pointed at whatever cluster the kubeconfig names (minikube on a dev machine) | cluster-agents claim by tag and create the Agent CR |
| git credentials | visit token → repo-scoped short-lived token | a GitHub App configured on the floor | lore's `POST /api/github-credentials` |
| agent definitions | shape + repo variants | rows as-is | project row → org default is the variant lookup |
| tenancy | `team_id` on every row | one fixed id | schema-per-team |
| agent context | none required | whatever the definition names | lore MCP gateway |

**The converter is a deliverable.** Lore's YAML puts `model` and `prompt_ref`
on nodes; this floor does not allow node overrides. A script reads each lore
line and emits this floor's lines and stations: one station per distinct
`(station_ref, prompt_ref, model)`, nodes pointing at those; `continues` →
conversation mode `continue` with `conversation_key`; `by_hand` → a manual
start event; terminal `retrospective` nodes → a node with no station; `job_ref` nodes →
`service` stations named after the job. All seventeen lore lines convert; the
nine that read lore's database run only behind the lore adapter.

Rule: the HTTP API never knows which adapter is wired. If an endpoint would
need to, the port is drawn in the wrong place.
