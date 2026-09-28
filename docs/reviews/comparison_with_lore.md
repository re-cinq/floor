# Plan vs lore's implementation

Source: lore's code as of 2026-09-27 (`apps/floor/src/work/assembly-run/*`,
`libs/assembly-lines`, `apps/stations`, `apps/event-router`,
`apps/cluster-agent`, `libs/shared`). Each row says what lore does, what the
plan does, and a verdict: **same**, **simpler**, **ahead** (plan has
something lore lacks), **behind** (lore has something the plan must add), or
**different** (a deliberate change).

## 1. The walk

| | lore | plan | verdict |
|---|---|---|---|
| routing | `getNextTransition` replays `station_runs` rows; only `advanceLine` calls it | same kernel, same rows | same |
| what triggers an advance | `assembly_run.start`, `kubernetes.agent_node.*`, `assembly_run.resume`, reaper tick, `assembly_run.run_station` | `node.<id>.start`, `station_run.reported`, reaper | simpler: two event names instead of five |
| how the next node is launched | `advanceLine` opens the row and dispatches in the same handler | `advanceLine` posts the node's start event; a second handler opens the row | different: one more hop, but by-hand and external starts become the same path |
| opening a visit | upsert on `(run, node, iteration)`, `input` COALESCEd, `(xmax = 0) AS created` | identical | same |
| by-hand nodes | `by_hand` only exempts reachability; launched via `POST /api/assembly-runs/{id}/run-station` → `assembly_run.run_station`; closes parked rows as `cancelled`, then launches at max iteration + 1 | node declares a `start` event; anyone posts it | simpler, but see gap G1 |
| replay after a hand-run | `replayFromLastHandRun`: visits before the last `requested_by` count only for numbering | kernel unchanged, so same | same |
| divergence guard, 200 unattended-node cap | in the kernel | kernel unchanged | same |
| run graph snapshot | `assembly_runs.graph` jsonb copied at start, `entry_node` arg can change the entry | no snapshot; `(line_id, line_hash)` reference | different: immutability makes the copy redundant; `entry_node` is lost, see G2 |
| resume / fork | `resume_from {run_id,node_id,iteration}` creates a NEW run copying the prefix of visits, with a definition-hash drift guard | no fork; a parked run is an open visit, resuming is posting its event | different, deliberate; lore's UI call maps to an event on the same run |
| cancel | NOT FOUND as an endpoint; runs end via task cancel, PR close, `finishLine` closing stranded rows, or the reaper | `POST /assembly-runs/:id/cancel` drops queued events and reaps open visits | ahead |
| subject key | builders per case (`plan:<id>`, `review:pr-<n>`, `backlog`…); unique index makes `start` a start-or-join | one argument marked `subject`; same unique index | simpler |
| start atomicity | run row + start event + deliveries in one CTE | "start, then posts the entry event" | behind, see G3 |

## 2. Dispatch and results

| | lore | plan | verdict |
|---|---|---|---|
| dispatch model | **pull**: Floor writes `dispatch_spec`, sets `status='queued'` + `required_tags`; a cluster-agent claims with `FOR UPDATE SKIP LOCKED` where `required_tags <@ its tags`; releases on failure with attempt count | **push**: the start-event handler "tells the executor to dispatch" | behind, see G4 |
| terminal status | cluster-agent watches Agent CRs, emits `kubernetes.agent_node.{succeeded,failed}` with the NDJSON output | the wrapper in the pod posts `station_run.reported` with the token | different: the pod reports itself instead of being watched; lore's watch becomes the lore adapter |
| outcome parsing | `LORE_NODE_RESULT:` JSON or bare word → `REVIEW_RESULT:` → default success; malformed marker fails | same contract kept for pod stations; the wrapper parses and posts a typed `Report` | same |
| how args flow between nodes | NOT via `NodeResult.args`: (a) `kind:"file"` artifact events in pod output, renamed `spec.plan → spec_plan`; (b) `assembly_run.resume` params from service stations and humans; (c) Floor-side stamps (`pr_url`, `pr_number`); merged with `args || $2` | one channel: `report.produced`, merged into the bag by the store | simpler: three channels become one |
| what a pod is handed | agent nodes: rendered prompt + `{description, prompt, context, ...parameters}` + `files` refs; station pods: `station_input` JSON with **all** string/number args plus `job_ref`, `prompt_ref`, `model` | a brief with only the declared needs | ahead: explicit needs instead of everything |
| recorded input | `station_runs.input` (0046), bounded 4KB/16KB/4KB, a record not the channel | `input` = the brief, is the channel | simpler; keep the size bounds, see G5 |
| retry context in the prompt | `withIncomingFailure` (2500 chars), `withPriorFailures` (3, across fork chain), `withCiFeedback`, `withRoundHandoff`, `withSpecReview`, `withSpecPlan` | `tail_on_failure` conversation mode, nothing else | behind, see G6 |

## 3. Files and artifacts

| | lore | plan | verdict |
|---|---|---|---|
| workspace | per-task GitHub App token in a k8s secret, ai-agent-subsystem clones to `/workspace/target`; only `ingest`/`validate` station pods clone | `git` item; the executor clones with a credential the station never sees | same idea |
| plan.md | recipe frontmatter `inputs:[{path, source: plan}]` + `watch:{event, path, upload}`; Floor proxies `GET /api/agent-files/runs/{id}/plan` to lore-api; upload accepted only for `planning.result` | `file` need and `file` produce on the station; blob store | simpler: one mechanism instead of a per-file route |
| spec-plan.json, decomposition.json | watched-file artifacts, merged into args as strings | `file` items in the bag | simpler |
| generic artifact store | NOT FOUND; artifacts ride args as strings; conversation archives in GCS; job logs in a bucket | Postgres `bytea` blobs, bucket adapter for lore | ahead |
| pod logs | `pod_log_chunks`, streaming off by default, 14-day prune | `station_run_logs`, batch endpoint | same |

## 4. Human stations

| | lore | plan | verdict |
|---|---|---|---|
| types | `feature_review`, `pr_review`, `ci_check`, `route` required, placeholders `{args.x}` only | form `human`, route template over declared needs | same |
| route rendering | `String(args[x])`, **no escaping**, null if any placeholder unresolved | URL-encoded, validated scheme | ahead |
| reporting | everything is `reportToParkedNode` → `assembly_run.resume {outcome, args, result}`; Refine = `changes_requested`, Approve = `success`, PR merge via webhook, `await-ci` via a cron sweep by node TYPE | `station_run.reported` on the open visit; webhook resolves the run by subject | same shape, one event name |
| timeout | reaper returns `wait` for human nodes, no timeout | every visit has a deadline | behind, see G7 |
| `always` edge into an open human node | hand-run closes the parked row as `cancelled` first, so the edge opens a fresh iteration of `author` | undefined | behind, see G1 |

## 5. Service stations

| | lore | plan | verdict |
|---|---|---|---|
| where `job_ref` nodes run | `merge_step`, `escalation_step`, `issues`, `comment-triage`, `retrospective` run in the pooled `stations` service, triggered by a `station.run` event it subscribes to; `detect`/`validate`/`ingest` run as pods via `lore-station <type> '<json>'` | form `service`: the floor POSTs the brief to the station's URL | different: push over HTTP instead of a subscribed event; needs the lore adapter to keep publishing `station.run` |
| result | `reportToParkedNode({outcome, args: result.args, result})`; thrown error → `failed/unknown`, no bus retry | posts `station_run.reported` | same |
| `retrospective` | a real service station in lore (episode + curated memory), and also the terminal marker | terminal ones → `marker`; the real one stays a service station | same, the converter must tell them apart |
| `POST /api/stations/{name}` | sweeps only, `http` trigger, in-process 409 latch | schedules post events; the sweep is a service station | same |

## 6. Agent definitions and templates

| | lore | plan | verdict |
|---|---|---|---|
| storage | `lore.agent_definitions`: `name, model, timeout_minutes, prompt, image, project_id, execution_mode, review_required, config` | versioned `agent_definition_versions` with `settings` + `variants` | same fields, plus history |
| resolution | project row wins over org row **per field**; `test_policy` inherits | variant = partial bundle merged over defaults, per field | same |
| `config` | `skills, pod_resources, disallowed_tools, watch, inputs, repo_workdir, command, env, pod_labels, needs_model, test_policy`, passthrough | not mentioned | behind, see G8 |
| prompt rendering | Floor: `{description}` first occurrence, replacer function; pod: second plain `{name}` pass over the whole rendered prompt, unmatched left literal, **no escaping** | single pass at open, declared needs only, escaped | ahead; lore's second pass is exactly the recursive-expansion flaw the plan forbids |
| model actually used | read back from `llm_calls` because the definition row can override at run time | frozen in the brief at open | ahead |
| deadline | `timeout_minutes ?? (station ? 15 : 30)`, reaper budget + 2 min | `opened_at + timeout` | same |

## 7. Events

| | lore | plan | verdict |
|---|---|---|---|
| topology | `apps/event-router` is now a separate deployable and the sole writer of `pipeline.events` (ADR-044, shipped): one `POST /api/events` front door for every producer (GitHub by HMAC, everyone else by bearer), fan-out to `pipeline.event_deliveries` composed into the same insert statement as each event (FR7), one row per `(event, subscriber)` | one `events` table, one process, but two claim paths: `EventStore.claimExcept` (the Floor's own loop drains every name except `station_run.dispatch`/`station_run.abort`) and tag-scoped `EventStore.claim` (a cluster agent claims only those two names, `FOR UPDATE SKIP LOCKED` filtered to `tags <@ its offered tags`) | simpler: one table/process instead of a router service plus a subscriber registry; note G4's pull-by-tag dispatch (section 2) is implemented, not just planned — `claim`'s tag filter is exactly that |
| retry | FR1: `2^attempts` seconds from a 2s base (2s → 4s → 8s → 16s…) capped at 300s; FR2 dead-letters once attempts reach the cap; FR4 dead-letters an unhandled event name immediately, no retry | `backoffMs`: `min(1000 * 2^attempts, 600_000)` — same doubling shape, cap raised to 10 min; `MAX_ATTEMPTS = 8` vs lore's cap-at-5; a `Refusal` (bad/unroutable event) dead-letters immediately in `Dispatcher.giveUpOrRetry`, matching lore's unknown-name case | same shape, wider cap and more attempts |
| visibility timeout / stale reclaim | originally one fixed ~600s ceiling on the stuck-row reaper (ADR-015); `station-consolidation` FR9 (in progress as of last ingest, 2026-09-04) replaces that with a per-delivery deadline stamped from the subscribing station's own declared timeout, because one global cap re-queues a slower handler while it is still running | flat `CLAIM_STALE_MINUTES = 5` (300s) for every claimer, no per-name budget; a separate `Sweeper.sweepUnclaimedDispatches` fails the visit and dead-letters any `station_run.dispatch` no cluster agent claimed within `UNCLAIMED_DISPATCH_MINUTES = 30`, new since this table was last written | ahead of lore's *shipped* 600s-flat behaviour; behind where lore's FR9 is headed (per-subscriber budgets) — the plan's dispatch-specific 30-min sweep is a narrower version of the same idea |
| scheduling | scheduler ticks every 30s, `jobIsDue` against `job_runs`, 16 cron emitters | `not_before` on the row, schedules materialised a day ahead | ahead: lore has no `not_before` |
| lease | `pg_try_advisory_lock(8140311)` on a dedicated session, exit on error | shipped: `FloorLoop.ensureLease` calls `acquireLease(pool, leaseKey)` — a Postgres advisory lock, same mechanism — held across the poll/sweep loop, released in `stop()` | same, now confirmed implemented rather than referenced |
| producer resilience | producer-side retry is not webhook-specific: a shared `EventProxy` (moved to `libs/shared` 2026-08-28, "no longer the watch's to own — or to have alone") is what every network-crossing producer reports through — GitHub webhooks, cluster-agent's terminal Agent-CR reports, human-station resumes — sized by `DEFAULT_QUEUE_CAPACITY`/`DEFAULT_REPORT_RETRY` in `event-tuning.ts`; every event carries a `dedupeKey` so a retried report is safe to repeat; the queue is explicitly in-memory and "not a durability budget", dies with the process | not present in `EventStore`/`Dispatcher`/`Sweeper`/`FloorLoop`; `EnqueueInput.dedupeKey` exists on the store side (a repeated enqueue with the same key returns the existing row) but nothing on the producer/reporting side retries yet | behind, see G9 — sharper picture of what lore does: it's a shared retry-with-dedupe component used by every producer, not a single webhook-side proxy, and it is explicitly not meant to survive a process restart |

## 8. Telemetry and cost

| | lore | plan | verdict |
|---|---|---|---|
| sink | pod → cluster-agent `/api/cluster/agent-events` → Floor `/api/agent-events`, one pass, cost first, turns skip-not-fail | `POST /station-runs/:id/{logs,turns,llm-calls}` with the visit token | same, less indirection |
| correlation | by `agent_cr_name` → `station_runs`, anomalies metered | keyed on `station_run_id` directly | simpler |
| service-node usage | NOT FOUND: `result.usage` from service stations is never recorded | `Report` has no `usage` either | behind, see G10 |

## 9. Auth

| | lore | plan | verdict |
|---|---|---|---|
| run credential | HMAC `v1.<claims>.<sig>`, claims `{stationRunId, repo, expiresAt}`, 24h; traded at `POST /api/github-credentials` for a GitHub token; refused once the visit is closed or the repo differs | visit token, scoped to the visit, expiring at the deadline | same idea |
| git credential for pushing | the pod trades its run credential for a repo-scoped GitHub token | the executor clones; the station never sees a credential | behind for push nodes, see G11 |
| telemetry auth | shared `LORE_AGENT_INTERNAL_TOKEN` on the platform cluster, per-agent token on satellites | the visit token | ahead: per visit instead of shared |
| MCP gateway | `mcp_servers` block with `lore-mcp-auth`, pods present the ingest token | "agent context: whatever the definition names" | same, through the lore adapter |

## 10. Loader

| | lore | plan | verdict |
|---|---|---|---|
| node fields | `id, type, prompt_ref, model, condition_ref, job_ref, route, station_ref, timeout_minutes, required_tags, continues, description, by_hand` | `id, station[@hash], start, bind` | different, by decision; the converter maps the rest |
| validation | reachability, outgoing edges, `job_ref` required by type, route placeholders, `continues` key, producible-outcome coverage, DFS cycle with human exemption | same set plus needs coverage and merge-without-review refusal | ahead |

## Gaps the plan must close

Status 2026-09-27: **all twelve are closed** in the plan. G6, G7 and G10 by
the simplification pass. G1 by closing open human visits as `cancelled` on
an outside start. G2 by `entry` on start. G3 by writing every follow-up
event in the transaction that caused it. G4 by dispatching through the
queue: `station_run.dispatch` claimed by tag. G5 by size bounds in the
conventions. G8 by `settings.config`. G9 by wrapper retry until deadline.
G11 by `access: write` on a git need plus the git-credential exchange. G12
by conversation archives as blobs. The process and marker kinds no longer
exist; a node without a station is the marker.

- **G1. Edge into an open node.** Lore's hand-run closes the parked row as `cancelled` before launching, so `validate → author, always` opens `author` again at iteration + 1. The plan must pick: same as lore, or "an edge into an open node is a no-op". Lore's behaviour is safer for the replay; the page just shows the new iteration.
- **G2. `entry_node`.** Lore can start a run at a node other than `entry` (Approve starts spec work at `analyse-specs`). Add an optional `entry` to start, validated against the line.
- **G3. Start is one transaction.** Run row and entry start event commit together, as lore's CTE does. Otherwise a crash between them leaves a run nothing will ever advance.
- **G4. Pull dispatch and `required_tags`.** Lore's cluster-agents claim queued visits by tag; that is what makes satellite clusters work and what survives a dead executor. The pod executor adapter should be a claim endpoint (`POST /station-runs/claim` with tags, `FOR UPDATE SKIP LOCKED`, release on failure), not a push. Visits need `required_tags`.
- **G5. Size bounds.** Lore bounds the recorded input at 4KB/16KB/4KB. Cap `value` items and the brief the same way.
- **G6. Failure context in prompts.** Lore feeds the last failure, prior failures across iterations, CI feedback and round hand-offs into the retry prompt. The plan has only `tail_on_failure`. Add built-in needs the executor fills from earlier visits: `previous_error`, `previous_failures`, capped like lore.
- **G7. Human visits have no deadline.** Lore's reaper waits forever on human nodes. The plan's deadline must be nullable, or the human form's timeout infinite, and the token for a human visit is the session anyway.
- **G8. Agent definition `config`.** Skills, pod resources, disallowed tools, env, command, workdir. Add an open `config` object to `settings`, passthrough, variant-mergeable, like lore.
- **G9. Producer-side retry.** A station posting its report must retry with backoff and never drop it; lore's proxy retries 5×. Say so in the wrapper contract.
- **G10. Usage on the report.** The simplified `Report` lost `usage`. Service and marker forms have no telemetry sink, so cost from a service station is lost, exactly lore's NOT FOUND. Put `usage` back on `Report`.
- **G11. Push credentials.** Push, address-feedback and spec-write nodes push to GitHub from inside the pod. Add a credential exchange: the visit token buys a repo-scoped, short-lived git token, refused once the visit is done, which is lore's `POST /api/github-credentials` behind the visit token.
- **G12. Conversation archives.** Lore stores them in GCS and hands the pod a `resources.conversation` URL. In the plan, an archive is a `file` item: the wrapper uploads the tgz as a blob and `sessionRef` is its hash. Say so, and note lore's `mayContinue` rule: never continue after a failed visit.

## What the plan does better, in one list

One channel for data between nodes instead of three. A brief with declared
needs instead of every arg. A blob store instead of strings in args. A
`not_before` column instead of a scheduler with a job-runs table. Per-visit
tokens instead of a shared internal token. Escaped single-pass templates
instead of an unescaped double pass. Versioned definitions instead of
mutable rows. A cancel endpoint. Two event names for the walk instead of
five. No forked runs.
