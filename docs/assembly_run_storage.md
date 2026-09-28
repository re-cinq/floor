# Assembly run storage

The one object through which an assembly run's state is read and changed.
Stations never see the tables. They see a **brief** going in and post a
**report** coming out, and the store turns those into rows.

Lore's `pipeline.assembly_runs` and `pipeline.station_runs` map onto these
tables column by column; the mapping is at the end. The names that mean the
same thing are kept.

## The rule

```
run state  =  (line id, line hash)  +  start items  +  ordered visits
```

The line reference and the start items are written once, at start.
Everything after is a **visit**, append-only. Whether a run is open, its
current node and its bag are **derived** by replaying the visits. Nothing is
stored twice: where an index needs a value from inside a visit's JSON,
Postgres computes it as a generated column.

**Visits are the truth; events are how they change.** Every change arrives
as an event, the loop applies it through the store, the store writes a
visit. If the two disagree the visits win.

Each visit records the station hash and agent definition hash it resolved to
at open, so "what did this run execute" is answered by the visits. Stations
and agent definitions evolve independently of lines.

## The station contract

This is all a station author sees. Two shapes and one function.

```ts
interface Brief {
  needs: Record<string, string>;   // name -> the value, or a URL to fetch, per the declared kind
  iteration: number;
}

interface Report {
  outcome: string;                      // one of the outcomes the station declared
  produced?: Record<string, string>;    // name -> the value, or the blob hash
  sessionRef?: string;                  // blob hash of the conversation archive
  error?: string;
}

type Handle = (brief: Brief) => Promise<Report>;
```

`cancelled` is an outcome no station can report; only the store writes it.
A report is retried by its sender until the deadline, which is safe because
writing it is a compare-and-set and an equal replay is a no-op.

A station version declares, by name only, what it needs and produces:

```yaml
name: implement
kind: agent                            # agent | service | human
agent_definition: implementer          # agent kind only
conversation: new                      # agent kind only: new | continue
outcomes: [success, failed]            # the default; a reviewing station adds changes_requested
must_change: true                      # a success with no diff on the branch is a failure
needs:
  - { name: workspace, kind: git,   path: repo, access: write }
  - { name: spec,      kind: file,  path: spec.md }
  - { name: findings,  kind: file,  path: findings.json, optional: true }
produces:
  - { name: patch,     kind: file,  path: out/patch.diff }
  - { name: pr_number, kind: value }
```

`path` is relative to the pod's workspace, `/workspace`, and is read only
for the agent kind. An agent's prompt is told where each one is: besides
every value need under its own name, it gets `{<name>_path}` for every file
need, git need and file the station produces, as a full path. A prompt that
names a bare `note.md` is wrong whenever no repo is cloned, because the
agent's working directory is then `/`. The bag is the only channel between
stations and it is write-forward only.

> **Not built yet.** `must_change` is accepted and ignored.

**Conversation.** With `continue`, the previous visit is the last successful
visit of the same node in the same run, or, when the station sets
`conversation_key` to a bag item name, the last successful visit of that
node with the same value for that item across runs of the same repo. The
store resolves that visit's `sessionRef`.

**Failure context.** Two built-in optional needs any agent prompt may
reference, filled from earlier visits of the same node: `previous_error`
(capped at 2500 characters) and `previous_failures` (up to three).

## The rows

```ts
type Item = { kind: "value" | "file" | "git"; ref: string; by: string; sha?: string };
//   value: ref is the text.   file: ref is the blob hash.
//   git:   ref is "host/owner/name@branch", sha is what the branch pointed at when the item was written.
//   by:    the visit that produced it, or "start"

interface Run {
  id: string;
  lineId: string; lineHash: string;
  repo: string;                    // host/owner/name
  subjectKey: string | null;       // from the argument marked `subject`: "<arg>:<value>"
  startItems: Record<string, Item>;
  outcome: string | null;          // null while open; success | failed | iteration_max | error | cancelled
  finishedAt: Date | null;
}

interface Visit {
  id: string;                      // station_run_id
  runId: string;
  nodeId: string; iteration: number;
  stationHash: string | null;      // null for a marker
  agentDefinitionHash: string | null;
  brief: Brief;                    // frozen at open
  report: Report | null;           // null while open
  worker: string | null;           // who claimed it: pod, service, or person
  requestedBy: string | null;      // the person, when a manual start opened it
  deadline: Date | null;           // null for human
}
```

Derived at read, never stored: whether a run or a visit is open, the bag,
the current node, the next transition, every cost.

## Starting a run

Two doors, one `start`.

- **The API**: `POST /assembly-lines/:id/start`.
- **An event**: a line may declare start events. The handler for that event
  name maps the payload to arguments and calls the same `start`.

```yaml
name: code-review
start:
  on: [github.pull_request.opened, github.pull_request.synchronize]
  when: { draft: false }                    # optional: payload fields that must equal these values
  args:                                     # payload -> arguments, the same logic-less templates as prompts
    repo:   "{repository}@{head_ref}"
    pr_url: "{pull_request_url}"
```

`when` compares a field's text form, so `false` in the line matches `false`
in the payload. Only the latest version of a line is started by an event.
The run's repo is the one its `git` argument names, else the payload's
`repo`, else its `repository`; an event naming none starts nothing and is
dead-lettered, naming the line.

**A line never starts on an internal event of its own runs.** A line
declaring `internal.run.settled` would otherwise start again on its own
settling, forever. Two lines can still start each other in turn; nothing
stops that.

If an open run already holds the subject, `start` returns that run. `entry`
starts at a node other than the line's entry; the node must exist.

> **Not built yet.** A line's `files` are accepted and ignored, start
> arguments are not checked against the line's `args`, and a start cannot
> name a line version: it takes the latest.

## Routing: the kernel decides, events carry

Lore's `getNextTransition` stays the sole routing definition and enforces
`iteration_max`. **The walk never opens a visit directly.** On
`launch(B, n)` it posts B's start event; the handler opens the visit. Every
node has a start event, `node.<id>.start` by default, or any other name for
a node a person or an outside system starts.

**Every follow-up event is written in the transaction that caused it.**

| the store writes | and, in the same transaction, the event |
|---|---|
| a run, at start | `internal.run.started`, and the entry node's start event |
| a visit, at open | `station_run.dispatch`, for agent and service kinds |
| a report | the next node's start event, or the settle below |
| a report, when a worker claimed the visit's dispatch | `station_run.abort` for that visit |
| an outcome on the run, at settle | `internal.run.settled` |
| a cancel, or a fail | `station_run.abort` for each open visit, and `internal.run.settled` |

`station_run.abort` means "let go of this visit": a worker deletes what it
holds for it, a pod and its secret keys. It is posted when a visit ends for
any reason, not only when it is cut short, because nothing else tells a
cluster agent that a pod's visit is over. A dispatch nobody claimed gets
none, since nothing exists to let go of.

`internal.run.settled` is what everything after a run hangs on: a failure
notice, a check run, settling a task in lore. Each is a line that declares
it as its start event. The floor has no hooks. Both internal events say
whose run it was: `runId`, `lineId`, `repo`, `subjectKey`, `outcome`,
`reason`.

**A run that cannot go on is failed.** When the store refuses to open a
node (a required need is not in the bag, its station is gone), the run is
settled as `error` with the refusal as its reason. Otherwise it would have
nothing open and nothing queued, and wait forever.

**A start from outside closes open human visits first.** The walk posts a
start event with an iteration; a person or an outside system posts one
without. A start without one is a start by hand, whatever its name: the
store closes any open human visit of that run as `cancelled`, opens the node
at its next iteration, and records who asked. The edge back then opens the
human node at its next iteration, which keeps the kernel's replay
consistent. A redelivered start by hand finds the visit it already opened
and opens nothing.

> **Not built yet.** A start event for a run that has already settled is
> refused. Retrying a node of a finished run needs a way to reopen it.

**An event may answer for a person.** A human node may declare `reports`:
an event name, an optional `when`, and an outcome. When that event arrives
for the run, the store writes the report on the node's open visit. That is
how a merged PR or a green CI moves a waiting run on.

**Finding the run.** An event acting on a run carries `runId`, or a
`subjectKey` and its `repo`, resolved to the open run holding that subject.
A subject that finds no open run is acked: the run is simply not open. A
run id that finds no run is a mistake, and the event is dead-lettered.

## Resolution at open

1. **Station**: the node pins a hash, else latest.
2. **Agent definition**: the station's reference, latest version, variant
   keyed by the run's repo if present, else default.
3. **Needs**: from the bag, via the node's `bind` when names differ.
4. **Conversation and failure context**: from earlier visits, same repo.
5. **Deadline**: `now + queue_wait + timeout`. None for human.

## Dispatch: every worker pulls

Opening a visit for an agent or service station enqueues
`station_run.dispatch` with tags. Workers claim by offering tags.

| kind | tags on the event | who claims | what they do |
|---|---|---|---|
| agent | `kind:agent` plus the agent definition's `tags` | a cluster agent offering them | creates one `Agent` resource of the ai-agent-subsystem |
| service | `station:<name>` | the service, through the SDK | runs `handle(brief)` |
| human | not dispatched | | the route page shows the brief |
| marker | not dispatched | | the store reports `success` at open |

A dispatch nobody claims within `queue_wait` (30 minutes by default) makes
the floor report the visit `failed`, `error: unclaimed`, naming the tags no
worker offers. A launch that fails is failed back to the queue and retried
with backoff.

> **Not built yet.** **Provider out of credit.** When a visit fails with
> that error class, the floor pushes `not_before` on every pending agent
> dispatch by five minutes. The gate is data in the queue, so a restart does
> not forget it.

### The agent kind runs on the ai-agent-subsystem, with no code of ours in the pod

The cluster agent turns a claimed brief into one `Agent` resource:

| in the brief | in the `Agent` resource |
|---|---|
| a `git` need | `resources.repos`: url, ref, a token secret |
| a `file` need | `files`: path, the blob URL, a header secret |
| a `value` need | `parameters`, which fill the prompt's `{placeholders}` |
| a `file` produce | `output.watch`: path, upload to `/blobs`, a header secret |
| anything with a path | `parameters`: `<name>_path`, its full path under `/workspace` |
| the conversation it continues | `resources.conversation`: the earlier visit's id to restore from, this visit's id to save under |
| the model | `resources.secrets`: the key for that model family |
| turns, cost, the result | `output.sinks`: `POST /station-runs/:id/sink` |
| the visit token | the header secret, created for the visit and deleted when its abort is claimed |
| always | `resources.skills_source`: the floor's `/skills`, where the pod fetches the agent's settings |
| always | `permission_mode: bypass`, unless the definition says otherwise |

The floor names a model; **the cluster agent owns the secret** for it, in
its own cluster, and says which key that is where it is not the usual API
key: a laptop running on a Claude subscription holds
`CLAUDE_CODE_OAUTH_TOKEN`. The name must be a key that exists, because the
pod's reference to it is not optional. The prompt is rendered once, by the
subsystem, from `parameters`. The floor does not render it a second time.

**What the subsystem requires, learned by running it.**

- A header secret holds a header, `Authorization: Bearer <token>`, not a
  token. A value with no colon is dropped without a word.
- The agent is started with a settings file fetched from `skills_source`.
  With none the agent dies at once, so the floor serves one.
- The conversation is saved under an id the agent takes as its session id,
  which must be a uuid. So it is the visit's id, and `sessionRef` on the
  report stays what it was: the hash of the archive.
- A pod has nobody to answer a permission prompt, so without `bypass` every
  tool is refused.
- A station's run history is never 0. At 0 the controller deletes a finished
  `Agent`, reconciles the copy still in its cache, and runs the job again.

**The sink takes one event per request**, each in the subsystem's envelope,
`{source, event}`. A line of the agent's own stream becomes a `turn` record.
Its result line becomes an `llm_call` record with the cost. A file event for
an uploaded file becomes a produced item, if the station declares it and the
blob is really in the store. The lifecycle event that ends the visit becomes
`station_run.reported`, once however often it is posted: the agent phase
ending either way, or the init phase failing. The outcome is parsed from the
result's text: `LORE_NODE_RESULT:` first, then `REVIEW_RESULT:`, then
`success`; a marker that is there and cannot be read is `failed`. Only
outcomes and produces the station declares are taken.

A pod killed from outside posts nothing. Its visit fails at its deadline.

## Templates

Routes, prompts and start-argument mappings reference only declared names:
a station's needs, or an event payload's fields. Logic-less, single-pass.
Every value is escaped for where it lands and never enters a shell or a
query.

## Security: how the rules are enforced

> **Not built yet**, of the list below: the lint fence, the branded route
> type, fuzzing, the threat models, and the second reviewer. Built: the
> template engine as one module, with tests named after the attacks; the
> visit token, with tests proving it reaches only its own visit; no
> outbound request from the floor.

- Rules are tests first, each with a hostile input named after the attack.
- One module per boundary: templates, routes, tokens; a lint rule fences the
  template engine inside its module.
- Template scope is a type holding only declared names; secrets cannot be an
  `Item`; a route is a branded type.
- Templates, routes and report payloads are fuzzed.
- A threat model per kind; a test proves the token refuses everything else.
- Prompt injection is contained: items carry who produced them, external
  values are delimited, a node that pushes or merges needs a review or human
  node on every path into it.
- The floor makes no outbound request, so it cannot be steered at an
  internal address.
- Dependency audit, secret scanning, short-lived scoped tokens.
- Boundary code needs a second, security-focused reviewer.

## The store

```ts
interface AssemblyRunStore {
  start(input: StartRun): Promise<{ run: Run; joined: boolean }>;
  get(runId): Promise<Run | null>;
  list(filter, page): Promise<Page<Run>>;
  cancel(runId, reason): Promise<Run>;
  fail(runId, reason): Promise<Run>;                    // a run that cannot go on
  bag(runId): Promise<Record<string, Item>>;
  next(runId): Promise<Transition>;                     // pure
  settle(runId): Promise<Run>;

  openVisit(runId, nodeId, iteration, requestedBy?): Promise<{ visit: Visit; created: boolean }>;
  openVisitByHand(runId, nodeId, requestedBy): Promise<{ visit: Visit; created: boolean }>;
  nodeStartedBy(runId, eventName): Promise<string | null>;
  report(visitId, report: Report): Promise<Visit>;      // exactly once
  visits(runId): Promise<Visit[]>;
  visit(visitId): Promise<Visit | null>;
}
```

| event | handler calls |
|---|---|
| a line's start event | `start` |
| a node's start event, with an iteration | `openVisit` |
| a node's start event, without one | `openVisitByHand` |
| a node's start event the store refuses | `fail` on the run, and the event is dead |
| an event a human node's `reports` names | `report` on that node's open visit |
| `station_run.reported` | `report`, then `next`; the store wrote the follow-up |
| a dispatch past `queue_wait`, a visit past its deadline | `report` with `failed`, by the sweeper |
| any other event | `report` on the waiting nodes it answers for, then `start` for each line declaring it |

## Events: the queue and the loop

```sql
create table events (
  id              bigserial primary key,           -- the cursor
  name            text not null,
  payload         jsonb not null,
  dedupe_key      text unique,                     -- a repeated post is the same event
  tags            text[] not null default '{}',    -- dispatch and abort: a claimer must offer all of these
  run_id          uuid,
  not_before      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  claimed_at      timestamptz,
  claimed_by      text,
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

| name | posted by | claimed by |
|---|---|---|
| `node.<id>.start` | the store | the floor |
| `station_run.dispatch`, `station_run.abort` | the store | workers, by tag |
| `station_run.reported` | a station, the sink | the floor |
| `internal.run.started`, `internal.run.settled`, `internal.cost.missing` | the store | the floor, for lines that start on them |
| `schedule.<name>.tick` | the schedule | the floor |
| `github.*`, `manual.*`, anything else | outside | the floor |

The floor's loop runs on the instance holding the single-instance lease, a
Postgres advisory lock on a dedicated session.

1. **Claim** a batch: due, not acked, dead or dropped, unclaimed or claimed
   more than 5 minutes ago; `for update skip locked`.
2. **Dispatch** by name through a registry. Handlers call only the store.
3. **Ack** on success.
4. **Fail**: count the attempt, back off exponentially up to 10 minutes.
   After 8 attempts the event is dead, visible, and retryable by a person.
5. A stale claim is reclaimable, which is what survives a crash.

An event with no handler and no line starting on it is acked and counted.

The lease is checked before every pass: Postgres drops an advisory lock
with its connection and tells nobody. A refusal from the store is never
retried, the event is dead at once; anything else is.

> **Not built yet.** **Retention.** Events of a run are kept while it is
> open and 30 days after. `internal.*` events are the audit log and are
> never deleted. Today nothing is deleted.

## Costs

The floor collects every cost itself.

- **One source.** Every model call is an `llm_call` record, written as it
  happens: by the sink for agent pods, by the SDK for services.
- **Cost rows are never dropped.** A batch that is oversized or partly
  malformed still has its `llm_call` rows written.
- **Missing cost is an anomaly.** An agent visit that ends with no
  `llm_call` record raises `internal.cost.missing`. It never fails the
  visit. *Not built yet.*
- **Crashes still cost.** Records are written during the visit.
- **Rollups are queries.** Visit, run and aggregate cost are sums over
  records. *Not built yet: the cost is recorded, nothing sums it.*

## Concurrency

- `(run, node, iteration)` is unique; a redelivered start event does not
  dispatch twice.
- A report is a compare-and-set on `report is null`.
- `(repo, subject_key)` is unique among open runs.
- Nothing holds a lock across a network call.

## Tables

Postgres. Six tables.

```sql
-- every definition. Content-hashed; a row never changes.
create table definitions (
  kind        text not null,                       -- line | station | agent_definition | schedule
  id          text not null,
  hash        text not null,                       -- sha256 of body
  body        jsonb not null,
  archived_at timestamptz,
  created_by  text,
  created_at  timestamptz not null default now(),
  primary key (kind, id, hash)
);
create index definitions_latest on definitions (kind, id, created_at desc);

create table assembly_runs (
  id           uuid primary key,
  line_id      text not null,
  line_hash    text not null,
  repo         text not null,
  subject_key  text,
  start_items  jsonb not null,
  outcome      text,
  reason       text,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create unique index assembly_runs_subject_open on assembly_runs (repo, subject_key)
  where subject_key is not null and finished_at is null;
create index assembly_runs_list on assembly_runs (created_at desc, id desc);

create table station_runs (
  id                    bigserial primary key,      -- the replay's order
  station_run_id        uuid not null unique default gen_random_uuid(),
  assembly_run_id       uuid not null references assembly_runs(id),
  node_id               text not null,
  iteration             int  not null,
  station_hash          text,
  agent_definition_hash text,
  input                 jsonb not null,             -- the Brief
  report                jsonb,                      -- the Report
  worker                text,
  requested_by          text,
  deadline              timestamptz,
  opened_at             timestamptz not null default now(),
  finished_at           timestamptz,
  outcome               text generated always as (report->>'outcome') stored,
  session_ref           text generated always as (report->>'sessionRef') stored,
  unique (assembly_run_id, node_id, iteration)
);
create index station_runs_open on station_runs (deadline) where report is null;
create index station_runs_by_run on station_runs (assembly_run_id, id);

create table events ( ... );                        -- above

create table blobs (
  hash text primary key, bytes bytea not null, size bigint not null,
  content_type text, created_at timestamptz not null default now()
);

create table station_run_records (
  station_run_id uuid not null,
  kind           text not null,                     -- log | turn | llm_call
  seq            int  not null,
  body           jsonb not null,
  at             timestamptz not null,
  primary key (station_run_id, kind, seq)
);
```

A Postgres `bytea` blob store is the default (decided 2026-09-25); lore uses
an object bucket behind the same port. A blob is reaped when no visit
references its hash and no run is open.

> **Not built yet.** The reaper exists and nothing runs it. When something
> does, it must leave alone what a visit still running has uploaded: those
> blobs are named by nothing until the visit reports.

## Mapping from lore's columns

| lore | here |
|---|---|
| `assembly_runs.blueprint_name`, `blueprint_hash` | `line_id`, `line_hash` |
| `assembly_runs.graph` | not stored; the line version is immutable |
| `assembly_runs.args` | `start_items`, plus each report's `produced` |
| `assembly_runs.status` | derived from `finished_at` and `outcome` |
| `assembly_runs.task_id`, `branch` | run arguments: a `value` item and the `git` item's branch |
| `assembly_runs.resumed_from_*`, `inherited_node_count` | none; a waiting run is an open visit |
| `station_runs.input` | `input`, now the channel and not only a record |
| `station_runs.outcome` | `outcome`, generated from the report |
| `station_runs.failure_class`, `failure_detail` | `report.error` |
| `station_runs.agent_cr_name`, `cluster_agent_id` | `worker` |
| `station_runs.status`, `claimed_at`, `launch_attempts`, `dispatch_spec`, `required_tags` | the `station_run.dispatch` event |
| `station_runs.commit_sha` | none; lore never writes it |
| `agent_run_events`, `agent_run_turns`, `llm_calls`, `pod_log_chunks` | `station_run_records` by kind |
| `audit_log` | `internal.*` events |
| `events.dedupe_key` | `dedupe_key` |
