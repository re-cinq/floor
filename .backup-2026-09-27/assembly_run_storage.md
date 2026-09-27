# Assembly run storage

The one object through which an assembly run's state is read and changed.
Stations never see the tables. They see a **brief** going in and post a
**report** event coming out, and the store turns those into rows.

Compatible with lore's `pipeline.assembly_runs` and `pipeline.station_runs`:
every lore column keeps its name and meaning.

## The rule

```
run state  =  (line id, line hash)  +  ordered visits
```

The line reference is written once, at start. Everything after is a **visit**,
append-only. Status, the current node and the bag are **derived** by replaying
the visits; the bag is a fold of the reports' produced items in visit order,
seeded by the start items. Nothing is stored twice: where an index needs a
value that lives inside a visit's JSON, Postgres computes it as a generated
column.

**Visits are the truth; events are how they change.** Every change arrives as
an event, the loop applies it through the store, the store writes a visit.
Events are durable while their run is open, so a run's event list
reconstructs its history. If the two disagree the visits win.

There is no blueprint clone. The line hash identifies the graph. Each visit
records the station hash and agent definition hash it resolved to at open, so
"what did this run execute" is answered by the visits. Stations and agent
definitions evolve independently of lines.

## The station contract

This is all a station author sees. Two shapes.

```ts
interface Brief {
  needs: Record<string, string>;   // name -> value, path, or URL, per the kind the station declared
  iteration: number;
}

interface Report {
  outcome: "success" | "changes_requested" | "failed";
  produced?: Record<string, string>;   // name -> value, or the path the executor uploads
  usage?: { inputTokens: number; outputTokens: number; costUsd: number; model: string };
  sessionRef?: string;                 // blob hash of the conversation archive, for `continue`
  error?: string;
}
```

A fourth outcome, `cancelled`, exists on visits but no station can report
it; only the store writes it, when it closes an open human visit.

**Delivery.** The wrapper and the SDK retry posting the report with backoff
until the deadline. That is safe because `report` is a compare-and-set and
an equal replay is a no-op. A report that never arrives is the reaper's job.

A station version declares, by name only, what it **needs** from the bag and
what it **produces** into it, plus its form, conversation mode and agent
definition:

```yaml
name: implement
kind: agent                            # agent | service | human
agent_definition: implementer
conversation: new                      # new | continue
needs:
  - { name: workspace, kind: git,   path: /work/repo }
  - { name: spec,      kind: file,  path: /work/spec.md }
  - { name: findings,  kind: file,  path: /work/findings.json, optional: true }
  - { name: pr_number, kind: value }
produces:
  - { name: patch,     kind: file,  path: /work/out/patch.diff }
  - { name: pr_number, kind: value }
```

`path` is read only by the agent kind, which has a filesystem. The bag is the only
channel between stations and it is write-forward only: produced items are
visible to later visits, never earlier ones. Big things are `file` items.

**Conversation mode.** The previous visit is the last done visit of the same
node in the same run, unless the station sets `conversation_key` to a bag
item name, in which case it is the last done visit of that node with the same
value for that item across runs of the same team and repo. The store resolves
the previous visit's `sessionRef`; the station resumes or starts cold. A
visit never continues from a failed one.

**Failure context.** Two built-in optional needs any agent prompt may
reference, filled from earlier visits of the same node: `previous_error`
(the last failed visit's error, capped at 2500 characters) and
`previous_failures` (up to three earlier ones). They replace a third
conversation mode.

**Start events.** Every node has one; the default is `node.<id>.start`. A
node may name any other, `manual.validate` from a page button or
`github.pr.merged` from outside, which is how a node with no inbound edge is
started.

**Static validation at line creation.** Every required need of every node is
seeded at start (an argument or a line-shipped file) or produced on every edge
path into it. A node with a non-default start event has no edge paths, so its
required needs must be seeded and the rest `optional`.

## The rows

```ts
type Item = { kind: "value" | "file" | "git"; ref: string; by: string };   // text, blob hash, or "repo@sha"; by = visit id or "start"

interface Run {
  id: string;
  lineId: string; lineHash: string;
  repo: string;                    // host/owner/name
  subjectKey: string | null;       // from the argument marked `subject`: "<arg>:<value>"
  status: "queued" | "running" | "finished" | "cancelled";
  outcome: string | null;          // set once, at settle
}

interface Visit {
  id: string;                      // station_run_id
  runId: string;
  nodeId: string; iteration: number;
  stationHash: string; agentDefinitionHash: string;
  status: "open" | "done";
  brief: Brief;                    // frozen at open
  report: Report | null;           // written once
  worker: string | null;           // who took it: pod name, person, or service URL; set at claim or dispatch
  deadline: Date | null;           // null for human kind
}
```

Derived at read, never stored: the run's bag, its current node, the next
transition. The executor's private view (settings bundle, fetch and upload
URLs, the resolved previous session, the token) is built from a visit when it
dispatches and is not a row.

## Routing: the kernel decides, events carry

Lore's `getNextTransition` stays the sole routing definition and enforces
`iteration_max`. **The walk never opens a visit directly.** On
`launch(B, n)` it posts B's start event; the handler opens the visit. A node
reached by an edge and one started from outside are the same thing to the
store.

**Every follow-up event is written in the transaction that caused it.**
`start` inserts the run and its entry start event together. `report`
inserts the report and the next start event, or settles the run, together.
`openVisit` inserts the visit and its `station_run.dispatch` together. There
is no window in which a row exists and the event that moves it on does not.

**A start from outside closes open human visits first.** When a start event
other than `node.<id>.start` opens a visit, the store closes any open human
visit of that run with outcome `cancelled`, as lore does. The edge back
then opens the human node at its next iteration, and the kernel's replay
from the last by-hand visit stays consistent.

**Entry.** A run may start at a node other than the line's entry, when
`start` is given `entry`. The node must exist and its required needs must be
seeded by the start items.

**Finding the run.** Every event acting on a run carries `run_id`, or a
`subject_key` the handler resolves to the one open run holding it on that
repo. Neither means floor-level (ticks, sweeps). An external event resolving
to no open run is acked and logged.

## Resolution at open

1. **Station**: the node pins a hash, else latest.
2. **Agent definition**: the station's reference, latest version, variant
   keyed by the run's repo if present, else default.
3. **Needs**: from the bag, via the node's `bind` when names differ. A `git`
   need declaring `access: write` marks the visit as allowed to trade its
   token for a push credential.
4. **Conversation and failure context**: the previous visit's `sessionRef`
   and errors, same team and repo. A `sessionRef` is the blob hash of a
   conversation archive; never taken from a failed visit.
5. **Deadline**: `opened_at + timeout` from the resolved settings.

A node never overrides a station.

## Transport

Every kind gets the brief and a **visit token**, minted at open, scoped to
that visit, expiring at its deadline. It allows: read this brief, read the
blobs its needs reference, write blobs into its produces, post
`station_run.reported` for this visit, write this visit's records, and
trade for a git credential if a need declares `access: write`.
A human session on the visit's team and repo satisfies the same check for a
human-kind visit.

**Reporting is one event**: `station_run.reported` (payload = `Report`),
posted by the station, exactly once per visit.

| kind | brief + token arrive as | needs | report |
|---|---|---|---|
| agent | a claimed `station_run.dispatch`; pod env `FLOOR_BRIEF_URL`, `FLOOR_TOKEN` | the wrapper fetches, writes at `path` | the wrapper uploads produces and the conversation archive, posts the event |
| service | brief as request body, `Authorization: Bearer` | the SDK fetches | the SDK uploads, posts the event |
| human | the route page, session auth | download links | the page uploads, posts the event |

A node that names no station is a **marker**: its visit opens and reports
success in the same transaction. Each kind is one implementation of the same `Station` interface; see
[entities/station.md](entities/station.md).

Blobs are content-addressed behind `GET /blobs/:hash` and `POST /blobs`.
Decided 2026-09-25: a Postgres `bytea` table by default, one dependency, 32 MB
cap (256 MB for a conversation archive), reaped when no visit references the hash and no run is open. Lore uses an
object bucket behind the same port. A `git` item is repo plus sha, cloned by
the executor with a credential the station never sees.

## Templates

Routes and prompts reference only the station's declared needs by name.
Logic-less, single-pass. Routes resolve when the page is read; prompts at open.
Every value is escaped for where it lands and never enters a shell or a query.

## Security: how the rules are enforced

- Rules are tests first, each with a hostile input named after the attack.
- One module per boundary: templates, routes, process arguments, tokens; a
  lint rule fences the template engine and `child_process` inside them.
- Template scope is a type holding only declared needs; secrets cannot be an
  `Item`; a route is a branded type.
- Templates, routes and report payloads are fuzzed.
- A threat model per kind; a test proves the token refuses everything else.
- Prompt injection is contained: items carry origin, external values are
  delimited, a merge or push node needs a review or human node on every path in.
- Dependency audit, secret scanning, short-lived scoped tokens.
- Boundary code needs a second, security-focused reviewer.

## The store

```ts
interface AssemblyRunStore {
  start(input: StartRun): Promise<Run>;                 // refuses SubjectBusy; no visit yet
  get(runId): Promise<Run | null>;
  list(filter, page): Promise<Page<Run>>;
  cancel(runId, reason): Promise<Run>;                  // drops the run's queued events; open visits reaped at deadline
  bag(runId): Promise<Record<string, Item>>;            // the fold
  next(runId): Promise<Transition>;                     // getNextTransition over visits(run); pure
  settle(runId): Promise<Run>;                          // status + outcome when next() is finish | fail

  openVisit(runId, nodeId, iteration, requestedBy?): Promise<{ visit: Visit; created: boolean }>;
  report(visitId, report: Report): Promise<Visit>;      // exactly once; equal replay is a no-op
  visits(runId): Promise<Visit[]>;
  visit(visitId): Promise<Visit | null>;
}
```

| caller | operations |
|---|---|
| `POST /assembly-lines/:id/start` | `start` (writes the entry start event) |
| handler for a node's start event | `openVisit` (writes `station_run.dispatch` for agent kind), then `station.dispatch` for service kind |
| a cluster agent | claims `station_run.dispatch` by tag, starts the pod |
| handler for `station_run.reported` | `report` (writes the next start event, or settles) |
| `POST /assembly-runs/:id/cancel` | `cancel` |
| the reaper | `report` with `failed`, `error: "timeout"` past deadline |

## Events: the queue and the loop

```sql
create table events (
  id              bigserial primary key,           -- the cursor
  team_id         text not null,
  name            text not null,                   -- node.<id>.start | station_run.dispatch | station_run.reported | schedule.<name>.tick | github.* | manual.*
  payload         jsonb not null,
  tags            text[] not null default '{}',    -- station_run.dispatch only: a claimer's tags must contain these
  run_id          uuid,                            -- resolved at insert from payload run_id or subject_key
  not_before      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  claimed_at      timestamptz,
  claimed_by      text,                            -- the floor instance, or a cluster agent's id
  acked_at        timestamptz,
  attempts        int not null default 0,
  last_error      text,
  dead_at         timestamptz,
  dropped_at      timestamptz                      -- by cancel
);
create index events_claimable on events (not_before, id)
  where acked_at is null and dead_at is null and dropped_at is null;
create index events_by_run on events (run_id, id);
```

Names owned by the floor itself are prefixed `internal.`, for example
`internal.cost.missing`.

The floor's loop runs on the instance holding the single-instance lease (a
Postgres advisory lock on a dedicated session) and claims every name except
`station_run.dispatch`. Those are claimed by cluster agents through
`POST /events/claim` with their tags, using the same five steps. An agent
visit always runs as a Kubernetes pod; a dev machine runs minikube.

1. **Claim** a batch: `not_before <= now()`, not acked, dead or dropped, and
   `claimed_at` null or older than 5 minutes; `for update skip locked`.
2. **Dispatch** by `name` through a registry; handlers call only the store
   and the executor port, and are idempotent because the store is.
3. **Ack** on success.
4. **Fail**: `attempts + 1`, `last_error`, `not_before = now() + backoff`
   (exponential, capped at 10 min), unclaim. After 8 attempts, `dead_at`;
   dead events are visible and retryable by a person.
5. A claim older than 5 minutes is reclaimable; that is what survives a crash.

Rows are kept while their run is open and 30 days after it settles.

**Schedules** are rows holding a name, a cron and an event payload. Each has
exactly one pending event. Acking a `schedule.<name>.tick` enqueues the next
occurrence with `not_before` set from the cron, in the same transaction as
the ack.

## Concurrency and idempotency

- `(run, node, iteration)` is unique; a redelivered start event gets
  `created: false` and does not dispatch twice.
- `report` is a compare-and-set on `report is null`.
- `(repo, subject_key)` is unique among open runs.
- Nothing holds a lock across a network call; dispatch happens after commit.

## Tables

Postgres. Six tables. Every table carries `team_id`. Nothing is stored
twice: values an index needs from JSON are `generated always as ... stored`.

```sql
-- every definition: lines, stations, agent definitions. Content-hashed; a row never changes.
create table definitions (
  team_id     text not null,
  kind        text not null,                       -- line | station | agent_definition | schedule
  id          text not null,                       -- the name nodes and stations point at
  hash        text not null,                       -- sha256 of body
  body        jsonb not null,
  archived_at timestamptz,                         -- set on every row of an archived id
  created_by  text,
  created_at  timestamptz not null default now(),
  primary key (team_id, kind, id, hash)
);
create index definitions_latest on definitions (team_id, kind, id, created_at desc);
-- line body: nodes, edges, start events, arg schema (with the `subject` mark), files (name -> blob hash)
-- station body: kind, needs, produces, conversation, agent_definition id, url or route
-- station body: also tags (which cluster agents may run it)
-- agent_definition body: settings (model, prompt, timeout_minutes, image, config), variants ("host/owner/name" -> partial settings)
--   config is an open object passed through to the wrapper: skills, pod_resources, disallowed_tools, env, command, workdir; variants merge it per key
-- schedule body: cron, event name, payload

create table assembly_runs (
  id           uuid primary key,
  team_id      text not null,
  line_id      text not null,                      -- lore: blueprint_name
  line_hash    text not null,                      -- lore: blueprint_hash
  repo         text not null,
  subject_key  text,
  start_items  jsonb not null,                     -- the seed of the bag; the rest is in the reports
  status       text not null,
  outcome      text,
  reason       text,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create unique index assembly_runs_subject_inflight on assembly_runs (repo, subject_key)
  where subject_key is not null and status in ('queued', 'running');
create index assembly_runs_list on assembly_runs (team_id, created_at desc, id desc);

create table station_runs (
  id                    bigserial primary key,      -- seq; the replay's order
  station_run_id        uuid not null unique default gen_random_uuid(),
  team_id               text not null,
  assembly_run_id       uuid not null references assembly_runs(id),
  node_id               text not null,
  iteration             int  not null,
  station_hash          text,                       -- null for a marker node
  agent_definition_hash text,                       -- agent kind only
  input                 jsonb not null,             -- the Brief; lore 0046
  report                jsonb,                      -- the Report; null while open
  worker                text,
  requested_by          text,                       -- lore 0092
  deadline              timestamptz,                -- null for human kind
  opened_at             timestamptz not null default now(),
  finished_at           timestamptz,
  outcome               text generated always as (report->>'outcome') stored,    -- lore column, now derived
  session_ref           text generated always as (report->>'sessionRef') stored,
  unique (assembly_run_id, node_id, iteration)
);
create index station_runs_open on station_runs (deadline) where report is null;
create index station_runs_by_run on station_runs (assembly_run_id, id);
-- status is not a column: a visit is open while report is null, done after.

create table events ( ... );                        -- defined above

create table blobs (
  hash text primary key, team_id text not null, bytes bytea not null,
  size bigint not null, content_type text, created_at timestamptz not null default now()
);

-- the data plane: logs, agent turns, llm calls. Batch-inserted; one bad row never fails a visit.
create table station_run_records (
  station_run_id uuid not null,
  kind           text not null,                     -- log | turn | llm_call
  seq            int  not null,
  team_id        text not null,
  body           jsonb not null,                    -- log: stream, chunk. turn: role, content. llm_call: model, tokens, cost_usd, duration_ms
  at             timestamptz not null,
  primary key (station_run_id, kind, seq)
);
```

The bag for a run is `start_items` folded with each done visit's
`report->'produced'` in `id` order. A visit's cost is the sum of `cost_usd`
over its `llm_call` records plus `report->'usage'`. Lore's `args` column maps
to `start_items`; lore's three telemetry tables map onto
`station_run_records` by kind.

## Costs

Decided 2026-09-27: the floor collects every cost itself. It does not rely
on lore, on a provider dashboard, or on a station remembering.

- **Two sources, one sum.** An agent visit's wrapper writes one `llm_call`
  record per model call as it happens. Any station may also put `usage` on
  its report, which is how a service station that calls a model reports.
  A visit's cost is the sum of both.
- **Cost rows are never dropped.** Records are skip-not-fail for logs and
  turns; a batch that is oversized or partly malformed still has its
  `llm_call` rows written. Same rule as lore's sink.
- **A visit with a model and no cost is an anomaly.** When an agent visit is
  done and has neither an `llm_call` record nor `usage`, the store writes an
  `internal.cost.missing` event naming the visit. It is visible in the feed
  and countable, and it never fails the visit.
- **Crashes still cost.** Records are written during the visit, not at the
  end, so a pod that dies after ten calls has ten rows.
- **Rollups are queries, not tables.** Visit cost, run cost and the
  aggregate by repo, line and day are sums over `station_run_records`.
  Nothing is stored twice.

## Converter notes, from lore

- **`extras` has no counterpart.** The wrapper maps what lore put there:
  cost and token headers to `usage`, failure text (`Lore-Validation-Failed`,
  `Lore-Dod-Blocked`) to `error`, round hand-off notes to produced values.
- **`file` items are used, not speculative.** Lore's planning line moves
  `plan.md` through a dedicated download and upload route, and carries
  `spec-plan.json` and `decomposition.json` as whole files inside an args
  string. The converter maps a recipe's `inputs` and `watch` settings to
  `file` needs and produces. New lines get the kind for free.
- **Service-station cost is recorded here** and is not in lore, where a
  service node's `usage` is never read.
