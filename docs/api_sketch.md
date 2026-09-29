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
  opaque `cursor`. Lists are ordered newest first on `(created_at, id)`.
  Lists marked *filter required* return 400 without one. *Built for runs,
  records and the events feed; the other lists return everything.*
- **Creates are idempotent by their natural key**, not by a header. A run by
  its subject, a definition and a blob by their content hash, an event by
  its `dedupe_key`. Repeating a create returns what already exists.
- **Type safety.** Definitions, run arguments and event payloads are typed
  schemas. A failing POST returns 400 with every error, not the first. An
  assembly line is also checked for what it refers to: entry, exit and every
  edge name a real node, every node but the exit has an outgoing edge, and
  every node's station is a known one.
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

## Assembly lines - blueprints for assembly runs

GET    /assembly-lines                   // filter on name
GET    /assembly-lines/:id               // latest version, including its argument schema and start events
GET    /assembly-lines/:id/versions      // every version, newest first
GET    /assembly-lines/:id/versions/:hash // one immutable version
POST   /assembly-lines                   // create a line (first version); 400 with all definition errors
PUT    /assembly-lines/:id               // does NOT mutate; creates a new version, returns its hash
DELETE /assembly-lines/:id               // archives; 409 while runs are open on it

POST   /assembly-lines/:id/start         // body: repo, startItems, optional entry. 201, or, if an open run already
                                         // holds the subject, that run (200, joined: true)
                                         // not built yet: checking startItems against the line's args, and naming a version

A run is also started by an **event**, when the line declares `start.on`.
That is how a PR opening starts a review and a schedule starts a sweep.

## Assembly runs - one execution of a line, walked on events

GET    /assembly-runs                    // filter required: line, open, repo, subject. Not built yet: since
GET    /assembly-runs/:id                // run + bag. Not built yet: current node, cost
POST   /assembly-runs/:id/cancel         // settles the run as cancelled, drops its queued events, aborts open visits

// its visits:  GET /station-runs?run=:id        its events:  GET /events?run=:id
// retrying a failed node, or starting a node by hand, is posting that node's start event with the run id
// no POST, PUT or DELETE: runs are created by start, and they are an audit trail

## Station runs - a single visit to a station inside a run

Read-only. A visit is open until its one report arrives, and the report
arrives as an event: `station_run.reported`, posted to `/events` with the
visit token.

GET    /station-runs                     // run required; node and open narrow it. Not built yet: station, since
GET    /station-runs/:id                 // the visit + outcome + worker + deadline, and `cost`: what its agent counted and
                                         // what that cost, model by model; null for a visit nothing was counted for
GET    /station-runs/:id/brief           // for the executor: each need with its kind, path and access, the resolved
                                         // settings, and a freshly minted visit token. 409 once the visit is done
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
DELETE /agent-definitions/:id            // archives. Not built yet: 409 while a station's latest version references it

## Migrations - the pipeline files that ran

GET    /migrations                       // service token only
GET    /migrations/:name                 // the sha256 the file ran as; 404 for one that has not run
PUT    /migrations/:name                 // { sha256 }. 409 for a name that ran as other content: a file runs once

The floor applies no file itself. `floor-pipeline migrate` (@floor/pipeline) does, through the routes above
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
                                         // naming a run does so by `runId`, or by `subjectKey` and `repo`.
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
pending event. Acking its tick enqueues the next occurrence. A line that
declares `start.on: schedule.<name>.tick` is what the tick starts. Service
token only.

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
