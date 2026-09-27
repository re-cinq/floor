# Assembly line

**A graph of nodes, each pointing at a station, joined by edges that route
on outcomes.** It is the blueprint. It does nothing by itself; a run is what
executes it.

## What it is not

- Not a run. Starting a line creates a run; the line is unchanged.
- Not where models or prompts live. Nodes point at stations, stations point
  at agent definitions. A node cannot override either.
- Not mutable. Editing a line creates a new version with a new content hash.
  Runs reference the version they started from.

## Fields

| field | meaning |
|---|---|
| `name` | the id |
| `entry`, `exit` | the first node, and the terminal marker node |
| `args` | the typed arguments `start` must be given; one may be marked `subject` |
| `files` | files shipped with the line version, seeded into every run's bag |
| `nodes[]` | `id`, `station` (optionally pinned `@hash`; omitted for a marker), optional `start`, optional `bind` |
| `edges[]` | `from`, `to`, `on` (`success`, `changes_requested`, `failed`, `always`), optional `iteration_max` |

### Nodes

A node is one *use* of a station. Its `start` event defaults to
`node.<id>.start`, which the walk posts when an edge leads here. A node may
instead name an outside event, and then no edge needs to lead to it. `bind`
maps a station's need name to a differently named bag item.

### Edges

An edge says: when node A finishes with outcome X, node B is next. The
kernel picks the exact-outcome edge over `always`. Revisiting a node bumps
its iteration; an edge with `iteration_max` fails the run once exceeded.

### Validation at creation

- every edge endpoint names a real node; every node is reachable; only the
  exit node is terminal
- every producible outcome of every node has an edge
- a cycle has an `iteration_max` somewhere, or a human node on it
- every required need of every node is seeded at start or produced on every
  path into it; a node with a custom start event must have its required
  needs seeded

## Example 1: the smallest real line, `code-review`

Lore's `code-review.yaml`: one agent, one retry, one marker.

```yaml
name: code-review
entry: review
exit: done
args:
  repo:   { kind: git }
  pr_url: { kind: value, subject: true }     # one open review run per PR
nodes:
  - { id: review, station: review }
  - { id: done }                             # no station: a marker
edges:
  - { from: review, to: done,   on: success }
  - { from: review, to: done,   on: changes_requested }
  - { from: review, to: review, on: failed, iteration_max: 1 }
```

## Example 2: a feedback loop, `implementation`

Lore's `implementation.yaml`: implement, validate, push, review, address,
with the review loop capped at two rounds.

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
  - { id: review,        station: review }
  - { id: address,       station: address-feedback }
  - { id: retrospective, station: retrospective }
  - { id: done }
edges:
  - { from: implement, to: validate,      on: success }
  - { from: implement, to: implement,     on: failed, iteration_max: 1 }
  - { from: implement, to: retrospective, on: changes_requested }
  - { from: validate,  to: push,          on: success }
  - { from: validate,  to: implement,     on: failed, iteration_max: 1 }
  - { from: push,      to: review,        on: always }
  - { from: review,    to: retrospective, on: success }
  - { from: review,    to: address,       on: changes_requested, iteration_max: 2 }
  - { from: review,    to: retrospective, on: failed }
  - { from: address,   to: validate,      on: always, iteration_max: 2 }
  - { from: retrospective, to: done,      on: always }
```

The bag makes the loop work without any node knowing about the others:
`implement` produces `patch`, `push` produces `pr_url`, `review` produces
`review_findings`, `address` needs `review_findings` and produces a new
`patch`. Each station declared only its own names.

## Example 3: people in the loop, `feature-planning`

Lore's `feature-planning.yaml` has two human nodes, one by-hand node, and a
node that continues a conversation. Converted, with the interesting parts:

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
  - { id: merged,        station: pr-merged }                 # human; route {pr_url}, the GitHub PR page
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
  - { from: push,          to: merged,        on: always }
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

Three things to see here:

- **`author` is a node like any other.** The run sits at that visit for days.
  A person clicking Refine on the plan page posts `station_run.reported` with
  `changes_requested`; clicking Approve posts `success`. The edges do the rest.
- **`validate` has no inbound edge.** The plan page's Validate button posts
  `manual.plan.validate` with the run id. The node runs, its `always` edge
  hands the findings back to `author`, which is still open. Lore called this
  `by_hand`.
- **`analyze` resumes itself.** Its station has `conversation: continue` with
  `conversation_key: plan_id`, so each Refine round continues the same agent
  conversation for that plan.

## Example 4: a straight line of service stations, `merge`

Lore's `merge.yaml`: nine steps after a PR merges, each routing both
`success` and `failed` onward so one failure is recorded and the line walks
on. Every node is a service station beside lore's database.

```yaml
name: merge
entry: settle
exit: done
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
edges:
  - { from: settle,          to: spec-status,     on: success }
  - { from: settle,          to: done,            on: failed }        # the one real precondition
  - { from: spec-status,     to: close-issue,     on: always }
  - { from: close-issue,     to: outcome-stats,   on: always }
  - { from: outcome-stats,   to: curate,          on: always }
  - { from: curate,          to: memory-feedback, on: always }
  - { from: memory-feedback, to: trust,           on: always }
  - { from: trust,           to: spec-tasks,      on: always }
  - { from: spec-tasks,      to: resume-planning, on: always }
  - { from: resume-planning, to: done,            on: always }
```

Lore wrote every pair as two edges; `always` is the same thing in one.
`resume-planning` in lore created a new run inheriting the parked one's
visits. Here it posts `github.pr.merged` with the plan's subject key, and
the parked feature-planning run, waiting at its `merged` node, continues.

## Workflow: authoring a line

1. List the stations you need. Create the ones that do not exist, declaring
   needs and produces by name.
2. Write nodes pointing at them. Use `bind` only where names differ.
3. Write edges for every outcome each station can produce.
4. Mark one argument as `subject` if two runs must not work the same thing.
5. `POST /assembly-lines`. The validator returns every problem at once.
6. `POST /assembly-lines/:id/start` with the arguments. You get a run.
