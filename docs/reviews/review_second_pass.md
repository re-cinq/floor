# Second pass: plan vs lore, and a complexity check

**Status: applied to the plan on 2026-09-27.** M1 to M7, the wrapper
replacement and S1 to S8 are all in the plan documents. Both open checks on
the ai-agent-subsystem passed: a run takes a list of watched files, each
uploadable to any URL with a header secret and reported with its sha256, and
a list of files to download. One addition the review did not foresee: a
human node's `reports`, so an outside event can answer for a person. The
previous versions of every document are in `.backup-2026-09-27/`.

2026-09-27. Two inputs: a fresh read of every plan document, and a second
exploration of lore covering what the Floor does *around* the walk (the
first pass covered the walk itself). 

## Verdict

The model is sound and smaller than lore's. It has **one structural hole**
(nothing but an HTTP call can start a run), **one duplication to avoid** (a
pod wrapper that re-implements what the ai-agent-subsystem already does),
and **eight cuts** that remove concepts without removing features.

## Part 1. What the plan would lose

Lore's Floor does a great deal in code hooks around the walk. The plan has
no place for any of it yet. Ordered by how much breaks without it.

### M1. Nothing starts a run except `POST /start`

In lore, most runs are started by events, not by people:

| what starts | trigger in lore |
|---|---|
| `code-review` | PR opened, synchronize, reopened, ready for review |
| `merge` | the merge-check sweep finds a merged PR |
| `implementation-loop`, detect lines | cron ticks |
| `ingest` | `internal.ingest.*` |
| `code-review-reply`, address, recheck | `comment-triage` finishing with an action (one line starting another) |
| `escalation` | a PR that cannot be opened |
| auto-merge | check run, check suite, review submitted |

The plan lets an outside event start a **node** of an existing run. It has
no way to start a **run**. Schedules post events that nothing can turn into
work.

**Fix, inside existing shapes:** a line may declare a start event, the same
idea as a node's, one level up.

```yaml
name: code-review
start:
  on: github.pull_request.opened            # or a list
  args:                                     # payload -> run arguments, logic-less templates
    repo:   "{repository}@{head_sha}"
    pr_url: "{pull_request_url}"
```

The handler for that event name starts the run through the same `start` the
API uses. A busy subject joins the open run, which is lore's start-or-join.

### M2. A run finishing tells nobody

Lore's `finishLine` runs seven hooks: settle the job run, release the token,
record an episode, settle the task, close or relabel the issue, publish the
GitHub check, notify on failure. The plan settles the row and stops.

**Fix:** `settle` writes `internal.run.settled` (run id, line, outcome,
reason) in its own transaction, and `start` writes `internal.run.started`.
With M1, every one of those hooks is a line or a service station started by
that event. The floor itself gains no code.

### M3. The floor talks to GitHub in lore; the plan has no GitHub at all

| lore hook | when | what it does |
|---|---|---|
| `stampLinePr` | `push-only` succeeded | opens the PR (the pod has no token), writes `pr_number`, `pr_url` |
| `maybeMarkPrReady` | next node is a PR review | updates title and body, flips draft to ready |
| `postReviewFromNode` | review node finished | posts the review with inline comments, deduped by a marker |
| `postReplyFromNode` | refine node finished | replies in thread, resolves it |
| `publishRunCheck` | launch and finish | GitHub check run on the head sha |
| `notifyLineFailure` | failed run | PR comment and a notification |

**Fix:** each becomes a node. A service station `open-pr` after `push`,
`mark-ready` before the human PR node, `post-review` after `review`. The
converter inserts them. Rule to write down: **the floor holds no GitHub
client**, exactly as it holds no Kubernetes client. It costs lines a few
more nodes and buys a floor with no provider code in it.

### M4. There are no branches

A `git` item is `repo@sha`. A station that pushes needs a branch to push to,
and lore mints it (`lore/<type>/<slug>-<id8>`) and creates it if missing.

**Fix:** a `git` item is `repo@branch` plus the sha it resolved to at start.
Reading stations check out the sha; writing stations push to the branch.
Branch naming is a start argument, so lore's minting stays in lore.

### M5. Queue time eats the work deadline

The plan's deadline runs from open. Lore separates them: a visit may wait 30
minutes to be claimed, and its work budget starts at the claim. Lore also
fails a visit nobody claims as `unclaimed`, with an explanation of which
tags no agent offers.

**Fix:** the deadline is `open + queue_wait + timeout`. When a
`station_run.dispatch` event dead-letters or passes `queue_wait` unclaimed,
the floor reports the visit `failed`, `error: unclaimed`. No new field.

### M6. Stations do not declare their outcomes

The validator must check that every outcome a node can produce has an edge.
Lore knows this per node type (`PRODUCIBLE_OUTCOMES`). The plan's station
declares none, so the check in the line doc cannot be implemented.

**Fix:** `outcomes: [success, failed]` on the station, the default; a
station that reviews adds `changes_requested`. A report with an undeclared
outcome is refused.

### M7. Smaller losses

- **Credit gate.** Lore stops dispatching agent nodes account-wide after an
  out-of-credit failure and probes every 5 minutes. Fix: on that failure
  class the floor pushes `not_before` on pending dispatch events. A gate as
  data, no in-memory state.
- **Zero-change guard.** Lore fails a delivering node that reports success
  with no diff against the default branch. Fix: a station setting
  `must_change: true`, checked by whoever pushes.
- **Start on a busy subject.** The store says refuse, the API says return
  the existing run, lore joins. Pick join.
- **Live view of turns.** Records have no cursor, so a page cannot follow an
  agent as it works. Fix: `since` on the records list.
- **Audit retention.** Events are deleted 30 days after their run settles.
  `internal.*` events are the audit log (lore keeps ~20 audit event types).
  They need their own retention, or never to be deleted.
- **Model credentials.** Nothing says how a pod gets its model key. In lore
  the cluster agent maps model family to a secret in its own cluster. Say
  so: the floor names a model, the cluster agent owns the secret.
- **Repo-level tags.** Lore lets a repo steer its pods to a cluster
  (`station_default_tags`). See S8.

### What lore has that the plan can safely not have

Verified dead or legacy in lore itself:

- commit trailers: no writer found; `station_runs.commit_sha` is always NULL
- task leases: no caller acquires one; nothing produces `lease_held`
- single-CR (graphless) runs: a one-node line replaces them
- run forks (`resumed_from_run_id`): an open visit replaces them
- `pipeline.tasks`: lore's concept. Lore creates the task, starts the run
  with `task_id` as an argument, and settles its task on `internal.run.settled`
- the local runner: never touched runs or visits

## Part 2. One duplication to avoid: the wrapper

The plan describes a "pod wrapper" that fetches needs, clones, renders the
prompt, runs the agent, uploads produces, streams records and reports. The
ai-agent-subsystem already does most of that, declaratively, per run:

| plan's wrapper does | ai-agent-subsystem already has |
|---|---|
| clone a repo with a credential | `resources.repos` with `token_secret` |
| download input files | recipe `inputs` |
| upload a produced file | recipe `watch` with `upload` |
| resume a conversation | `resources.conversation` |
| stream turns and cost | `output.sinks` with `headers_secret` |
| model key | `resources.secrets` |
| skills | `skills_source` |

So the agent kind needs **no code of ours inside the pod**. The cluster
agent translates a claimed brief into an `Agent` resource: git needs to
repos, file needs to inputs, produces to watches, the visit token to a
headers secret, the records endpoint to the sink. What remains is the final
report, which is the one thing the subsystem has to post, and the plan
already assumed it would.

Consequences: no wrapper package, no wrapper image, and the `minikube mount`
trick in the dev loop goes away. Not verified here: whether `watch` can
upload to an arbitrary URL with a bearer, and whether several watches per
run are allowed. Both are questions for the subsystem, not for the plan.

Naming collision to settle: the subsystem has its own `Station` (a runtime:
image and resources) and `AgentDefinition` (a recipe). The plan uses both
words for different things.

## Part 3. Cuts that lose nothing

| # | cut | what disappears | why nothing is lost |
|---|---|---|---|
| S1 | **Every kind is pulled** | the service station's `url`, the floor-side `Station` class with `dispatch` and `abort`, all outbound HTTP from the floor | services claim `station_run.dispatch` by tag, as cluster agents do, which is what lore's stations service already does with `station.run`. A station is then one function, `handle(brief)`. Abort is a `station_run.abort` event to whoever claimed. |
| S2 | **One cost source** | `usage` on the report, "two sources, one sum" | service stations write `llm_call` records through the SDK, like pods do. A crash still leaves rows. |
| S3 | **No `team_id` column** | the column on six tables, the tenancy convention | lore isolates by schema and standalone has one tenant, so the column filters nothing in either. Tenancy is which schema the floor connects to. |
| S4 | **No run `status` column** | `status`, its four values | a run is open while `finished_at` is null; `cancelled` is an outcome. Same trick already used for visits. |
| S5 | **Natural keys instead of `Idempotency-Key`** | the header convention and the table it needs but the plan never defined | runs are idempotent by subject, definitions and blobs by hash, events by a `dedupe_key` column, which lore already has. |
| S6 | **No duplicate reads** | `/assembly-runs/:id/events`, `/assembly-runs/:id/station-runs` | `/events?run=` and `/station-runs?run=` return the same rows. |
| S7 | **Two fewer documents** | `example_implement_review.md`, `clarifications.md` | the example is the stalest file in the plan (see part 4) and `entities/assembly-run.md` has a better walkthrough; the clarifications are all answered. |
| S8 | **Tags live on the agent definition** | `tags` on the station | agent definitions already vary per repo, so a repo can steer its pods to its own cluster. One field moves, one feature appears. |

Not worth cutting, though it looks tempting: the three named definition
resources in the API (one generic endpoint saves lines and costs clarity),
`bind`, the three item kinds, the start-event hop.

## Part 4. Stale or contradictory, in the plan as written

| where | problem |
|---|---|
| storage doc, header | "every lore column keeps its name and meaning" is false: `task_id`, `branch`, `args`, `graph`, `status`, `agent_cr_name`, `commit_sha` are gone or renamed |
| storage doc, station contract | still says "plus its form" |
| storage doc, store | `start` "refuses SubjectBusy"; the API and lore say join |
| example doc | shows a stored `bag` column and `status=done`; a service station with `agent_definition` and `conversation`; the exit node has an outgoing edge; `implement` pushes without `access: write`; start body uses `{kind, repo, sha}` while an item is `{kind, ref}` |
| api sketch, conventions | `Idempotency-Key` "stored for 24h" has no table |
| station doc | `handle` is a method of a floor-side class but runs in another process |
| schedules | stored as a content-hashed definition, yet `PUT` "updates the one pending event" |
| line doc, validation | "every producible outcome has an edge" cannot be checked (M6) |

## Scorecard

| | lore | plan today | plan after this review |
|---|---|---|---|
| tables for the run model | 9+ | 6 | 6 |
| columns on run + visit | 40+ | 29 | 23 |
| event names that move a run | 5 | 3 | 3, plus 2 lifecycle |
| ways data moves between nodes | 3 | 1 | 1 |
| station kinds | 12 node types, 3 runtimes | 3 | 3 |
| dispatch paths | 3 (claim, subscribed event, none) | 3 (pull, push, none) | 1 (pull) |
| floor-side hooks on finish | 17 | 0, and the features missing | 0, as nodes and triggers |
| provider clients in the floor | GitHub, Kubernetes (via agent), Slack | none | none |
| code of ours inside a pod | none (subsystem) | a wrapper | none |
| ways to start a run | 8+ call sites | 1 | 2 (API, event) |
| open gaps against lore | | 7 | 0 |
