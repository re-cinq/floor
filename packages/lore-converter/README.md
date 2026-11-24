# @floor/lore-converter

Reads a lore assembly line and the recipes its nodes name, and writes what this floor runs in its place: an assembly line, its stations and its agent definitions. It reads a lore checkout and changes nothing in it.

```
node packages/lore-converter/dist/cli.js --lore ~/workspace/lore --line code-review
node packages/lore-converter/dist/cli.js --lore ~/workspace/lore --all
node packages/lore-converter/dist/cli.js --lore ~/workspace/lore --line code-review --put http://localhost:8180
```

`--all` is a report: for each assembly line, what it became and what is left for a person to decide.

## Where this fits

This is a tool a person runs, and it does not stay up. It reads a lore checkout from disk. With `--put` it posts the result to a floor over HTTP like any other client. It links [`@floor/store`](../store/README.md) only for its types and `validateLine`, so it can say up front what a floor would refuse.

It is how lore's existing assembly lines get here. See [the map](../../README.md).

## What becomes what

| in lore | here |
|---|---|
| an `agent` node's `prompt_ref` and `model` | An agent definition, one per distinct pair. The prompt is kept as written |
| the recipe's front matter | The definition's settings: `timeout_minutes`, `model`, and in `config` its `disallowed_tools` and `test_policy` |
| an `agent` node | An agent station. It needs the repo at `target`, where lore's prompts look, and a value for each `{name}` the prompt asks for |
| what the agent prints | A file the station produces, `<node>_output`, `from: output`. Lore's prompts answer in their output |
| `repo_workdir: false` | The repo is cloned with `access: read` |
| `continues: { key: args.x }` | `conversation: continue`, `conversationKey: x` |
| `by_hand: true` | The node's start event is `manual.<line>.<node>` |
| the terminal `retrospective` | A node with no station |
| a review node a person works | A human station. Its `route`'s `{args.x}` is `{x}` |
| any other node | A service station, named after its job |
| `iteration_max` | `iterationMax` |

## What is not in lore's files

An assembly line's file does not say what starts it, what it is given, or what lore's floor did in code around it. `known-lines.ts` holds that, one assembly line at a time, each read by hand from lore's code. One with no entry there still converts, with the default arguments and no start event, and says so in its notes.

Today it holds three:

- `code-review` starts when a pull request opens.
- `code-review-recheck` never starts by itself. A push goes to a `review-router` station, which asks for one or the other of these two. That station is not in this repository, and lore is expected to run it.
- `code-review-reply` starts when a trusted person submits a review asking for changes.

The first two have a `post-review` station where lore's floor posted the review from a hook, and the third has a `post-reply` one.

A service station converts with no needs and no produces, because what a lore job read and wrote is in its code. Each is noted.

## Four of lore's assembly lines, converted

These are what lore's own lines look like as this floor's assembly lines. They are worked examples, written by hand, and show what the conversion is aiming at.

### `code-review`, the smallest real line

Lore's `code-review.yaml` has one agent, one retry and one marker.

```yaml
name: code-review
start:
  on: [github.pull_request.opened, github.pull_request.synchronize,
       github.pull_request.reopened, github.pull_request.ready_for_review]
  args:
    repo:   "{repository}@{head_ref}"
    pr_url: "{pull_request_url}"
entry: review
exit: done
args:
  repo:   { kind: git }
  pr_url: { kind: value, subject: true }     # one open review run per PR
nodes:
  - { id: review,      station: review }
  - { id: post-review, station: post-review } # in lore, a hook inside the Floor
  - { id: done }                              # no station: a marker
edges:
  - { from: review,      to: post-review, on: success }
  - { from: review,      to: post-review, on: changes_requested }
  - { from: review,      to: review,      on: failed, iteration_max: 1 }
  - { from: post-review, to: done,        on: always }
```

In lore the Floor posted the review to GitHub from a hook that ran when the node finished. Here it is a node like any other, so it is visible in the graph and retried by the same rules, and the floor needs no GitHub client. Every terminal `done` node in lore is a marker, a node that names no station.

### `implementation`, a feedback loop

Lore's `implementation.yaml` goes implement, validate, push, review, address, with the review loop capped at two rounds.

```yaml
name: implementation
entry: implement
exit: done
args:
  repo: { kind: git }
  spec: { kind: file }
  task_id: { kind: value, subject: true }
nodes:
  - { id: implement,     station: implement }
  - { id: validate,      station: validate }        # a pod in lore; kind agent here, running lint
  - { id: push,          station: push-only }
  - { id: open-pr,       station: open-pr }         # in lore, the Floor hook stampLinePr
  - { id: review,        station: review }
  - { id: post-review,   station: post-review }     # in lore, the Floor hook postReviewFromNode
  - { id: address,       station: address-feedback }
  - { id: retrospective, station: retrospective }
  - { id: done }
edges:
  - { from: implement, to: validate,      on: success }
  - { from: implement, to: implement,     on: failed, iteration_max: 1 }
  - { from: implement, to: retrospective, on: changes_requested }
  - { from: validate,  to: push,          on: success }
  - { from: validate,  to: implement,     on: failed, iteration_max: 1 }
  - { from: push,        to: open-pr,       on: always }
  - { from: open-pr,     to: review,        on: always }
  - { from: review,      to: post-review,   on: always }
  - { from: post-review, to: retrospective, on: success }
  - { from: post-review, to: address,       on: changes_requested, iteration_max: 2 }
  - { from: post-review, to: retrospective, on: failed }
  - { from: address,   to: validate,      on: always, iteration_max: 2 }
  - { from: retrospective, to: done,      on: always }
```

The bag makes the loop work without any node knowing about the others. Each station declares only its own names.

- `implement` produces `patch`.
- `open-pr` produces `pr_url`.
- `review` produces `review_findings`.
- `post-review` needs them and reports the review's own verdict as its outcome.
- `address` needs `review_findings` and produces a new `patch`.

The `repo` argument is a `git` item, `host/owner/name@branch`. Reading stations check out the sha it resolved to. `implement`, `push` and `address` declare `access: write` and push to the branch. The branch name is an argument, so whoever starts the assembly run names it.

### `feature-planning`, people in the loop

Lore's `feature-planning.yaml` has two human nodes, one by-hand node, and a node that continues a conversation.

```yaml
name: feature-planning
entry: analyze
exit: done
args:
  repo:    { kind: git }
  plan_id: { kind: value, subject: true }        # lore: subject_key = feature:<id>
nodes:
  - { id: analyze,       station: plan-analyze }              # conversation: continue, key plan_id
  - { id: author,        station: plan-author }               # human; route /repos/{repo}/plans/{plan_id}
  - { id: validate,      station: plan-validate, start: manual.plan.validate }   # lore: by_hand
  - { id: analyse-specs, station: spec-analysis }
  - { id: write,         station: spec-write }
  - { id: push,          station: push-only }
  - { id: open-pr,       station: open-pr }
  - { id: mark-ready,    station: mark-ready }                # in lore, the Floor hook maybeMarkPrReady
  - id: merged                                                 # human; route {pr_url}, the GitHub PR page
    station: pr-merged
    reports:                                                   # an outside event answers for the person
      - { on: github.pull_request.closed, when: { merged: true },  outcome: success }
      - { on: github.pull_request.closed, when: { merged: false }, outcome: failed }
  - { id: decompose,     station: feature-decompose }
  - { id: issues,        station: file-issues }               # service in lore
  - { id: done }
edges:
  - { from: analyze,       to: author,        on: success }
  - { from: analyze,       to: author,        on: changes_requested }
  - { from: analyze,       to: author,        on: failed }
  - { from: author,        to: analyze,       on: changes_requested }   # a Refine
  - { from: author,        to: analyse-specs, on: success }             # approval
  - { from: author,        to: done,          on: failed }
  - { from: validate,      to: author,        on: always }              # findings go back to the people
  - { from: analyse-specs, to: write,         on: success }
  - { from: analyse-specs, to: author,        on: changes_requested }
  - { from: analyse-specs, to: done,          on: failed }
  - { from: write,         to: push,          on: success }
  - { from: write,         to: analyse-specs, on: changes_requested, iteration_max: 1 }
  - { from: write,         to: done,          on: failed }
  - { from: push,          to: open-pr,       on: always }
  - { from: open-pr,       to: mark-ready,    on: always }
  - { from: mark-ready,    to: merged,        on: always }
  - { from: merged,        to: decompose,     on: success }
  - { from: merged,        to: author,        on: changes_requested }
  - { from: merged,        to: done,          on: failed }
  - { from: decompose,     to: issues,        on: success }
  - { from: decompose,     to: done,          on: changes_requested }
  - { from: decompose,     to: done,          on: failed }
  - { from: issues,        to: done,          on: success }
  - { from: issues,        to: decompose,     on: changes_requested, iteration_max: 1 }
  - { from: issues,        to: done,          on: failed }
```

- `author` is a node like any other. The assembly run sits at that visit for days. A person clicking Refine on the plan page posts `station_run.reported` with `changes_requested`, and clicking Approve posts `success`. The edges do the rest.
- `validate` has no inbound edge. The plan page's Validate button posts `manual.plan.validate` with the run id. The node runs, and its `always` edge hands the findings back to `author`, which is still open. Lore called this `by_hand`.
- `analyze` resumes itself. Its station has `conversation: continue` with `conversation_key: plan_id`, so each Refine round continues the same agent conversation for that plan.

A run of this line is traced step by step in [docs/assembly_run_storage.md](../../docs/assembly_run_storage.md#two-runs-traced).

### `merge`, a straight line of service stations

Lore's `merge.yaml` is nine steps after a PR merges. Each routes both `success` and `failed` onward, so one failure is recorded and the assembly run walks on. The one exception is `settle`. Everything after it assumes the task is merged, so its failure ends the run as `failed` at the `fail` node. Every node is a service station beside lore's database.

```yaml
name: merge
entry: settle
exit: done
fail: not-settled
args:
  task_id: { kind: value, subject: true }
  pr_url:  { kind: value }
nodes:
  - { id: settle,          station: settle }
  - { id: spec-status,     station: spec-status }
  - { id: close-issue,     station: close-issue }
  - { id: outcome-stats,   station: outcome-stats }
  - { id: curate,          station: curate }
  - { id: memory-feedback, station: memory-feedback }
  - { id: trust,           station: trust }
  - { id: spec-tasks,      station: spec-tasks }
  - { id: resume-planning, station: resume-planning }
  - { id: done }
  - { id: not-settled }
edges:
  - { from: settle,          to: spec-status,     on: success }
  - { from: settle,          to: not-settled,     on: failed }        # the one real precondition: the run settles as failed
  - { from: spec-status,     to: close-issue,     on: always }
  - { from: close-issue,     to: outcome-stats,   on: always }
  - { from: outcome-stats,   to: curate,          on: always }
  - { from: curate,          to: memory-feedback, on: always }
  - { from: memory-feedback, to: trust,           on: always }
  - { from: trust,           to: spec-tasks,      on: always }
  - { from: spec-tasks,      to: resume-planning, on: always }
  - { from: resume-planning, to: done,            on: always }
```

Lore wrote every pair as two edges, and `always` is the same thing in one. A run of this line starts on an event, `on: github.pull_request.closed`, `when: { merged: true }`, where lore ran a sweep every minute.

`resume-planning` in lore created a new run inheriting the parked one's visits. Here the same webhook, carrying the plan's subject key, reports on the open `merged` visit of the feature-planning run, and that run continues.

### Their stations

```yaml
# lore implementation.yaml node `implement`
name: implement
kind: agent
agent_definition: implementer
outcomes: [success, changes_requested, failed]
must_change: true
needs:
  - { name: workspace, kind: git,  path: repo, access: write }   # it commits and pushes
  - { name: spec,      kind: file, path: spec.md }
  - { name: review_findings, kind: file, path: findings.json, optional: true }
produces:
  - { name: patch, kind: file, path: out/patch.diff }
```

```yaml
# lore's Floor hook `stampLinePr`, now a station
name: open-pr
kind: service
needs:
  - { name: workspace,      kind: git }          # the branch the push node wrote to
  - { name: pr_title,       kind: value }
  - { name: pr_description, kind: value, optional: true }
  - { name: pr_draft,       kind: value, optional: true }
produces:
  - { name: pr_number, kind: value }
  - { name: pr_url,    kind: value }
```

```yaml
# lore feature-planning.yaml node `analyze`
name: plan-analyze
kind: agent
agent_definition: feature-planner
conversation: continue
conversation_key: plan_id
outcomes: [success, changes_requested, failed]
needs:
  - { name: workspace, kind: git,  path: repo }
  - { name: plan_id,   kind: value }
  - { name: plan,      kind: file, path: plan.md, optional: true }
produces:
  - { name: plan,      kind: file, path: plan.md }
```

```yaml
# lore feature-planning.yaml node `author`
name: plan-author
kind: human
route: /repos/{repo}/plans/{plan_id}
outcomes: [success, changes_requested, failed]
needs:
  - { name: repo,    kind: value }
  - { name: plan_id, kind: value }
  - { name: plan,    kind: file }
produces:
  - { name: plan,    kind: file }
```

Lore's `merge_step`, `escalation_step`, `issues`, `comment-triage` and the real `retrospective` are service stations. So is everything that talks to GitHub on the floor's behalf: `open-pr`, `mark-ready`, `post-review`, `post-reply`. Three of those were hooks inside lore's Floor: `stampLinePr` is `open-pr`, `maybeMarkPrReady` is `mark-ready`, and `postReviewFromNode` is `post-review`.

### An agent definition with repo variants

```yaml
name: reviewer
settings:
  model: gemini-3.1-pro-preview
  prompt: |
    Review the diff on {pr_url} against the spec. Emit REVIEW_FINDINGS as JSON
    and one REVIEW_RESULT line: success or changes_requested.
    {previous_error}
  timeout_minutes: 20
  image: ghcr.io/re-cinq/lore-station:1.4
  tags: []
variants:
  github.com/re-cinq/lore:
    model: claude-sonnet-4-6          # this repo wants the sonnet reviewer
  github.com/acme/secret-project:
    tags: [cluster:acme]              # this repo's pods run in acme's own cluster
```

Lore's per-repo overrides (project row, then org default, per field) are a variant.

### Reports from outside

A human node may wait for a system instead of a person, when a PR merges or CI turns green, by naming the event in its `reports`. Lore did this in code, once per case, with a webhook handler for merged spec PRs and a sweep every two minutes for CI.

```yaml
- id: merged
  station: pr-merged
  reports:
    - { on: github.pull_request.closed, when: { merged: true },  outcome: success }
    - { on: github.pull_request.closed, when: { merged: false }, outcome: failed }
```

## Checked

Every converted assembly line is run through the floor's own `validateLine`, against the stations it comes with. What the floor would refuse is a note.
