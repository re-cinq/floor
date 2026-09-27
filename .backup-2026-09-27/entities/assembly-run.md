# Assembly run

**One execution of one line version.** It holds a reference to the line,
the start arguments, and an ordered list of **station runs** (visits). That
is all. Everything else about a run, its status, its current node, the bag
of items stations pass along, is derived from those visits.

## What it is not

- Not editable. No PUT, no DELETE. It is an audit trail.
- Not a copy of the line. It references `(line id, hash)`; the version is
  immutable so the reference is enough.
- Not where bytes live. Files are hashes into the blob store.

## Fields

| field | meaning |
|---|---|
| `id` | uuid |
| `lineId`, `lineHash` | which line, which version |
| `repo` | `host/owner/name`; selects agent definition variants |
| `subjectKey` | what the run works on; at most one open run per `(repo, subjectKey)` |
| `startItems` | the arguments and line-shipped files; the seed of the bag |
| `status` | `queued`, `running`, `finished`, `cancelled` |
| `outcome` | set once at settle |

## Station run (a visit)

One station executing once inside one run, identified by `(run, node,
iteration)`. A node visited three times has three visits.

| field | meaning |
|---|---|
| `id` | station_run_id; logs, telemetry, blobs and the token key on it |
| `nodeId`, `iteration` | which node, which visit of it |
| `stationHash`, `agentDefinitionHash` | exactly what ran |
| `status` | `open` or `done`; derived from whether the report exists |
| `brief` | frozen at open: the needs as resolved from the bag |
| `report` | written once: outcome, produced items, session ref, error |
| `worker` | who took it: pod name, person, or service URL |
| `deadline` | opened at plus the resolved timeout; token expiry; reaper cutoff; none for human |
| cost | derived: the sum of the visit's `llm_call` records plus the report's `usage` |

## The bag

The items a run's stations pass to each other. Seeded from `startItems`,
then every done visit's `produced` merged in visit order, later wins. Each
item remembers which visit wrote it. Computed at read; never stored.

```
bag(run) = fold(startItems, visits.filter(done).map(v => v.report.produced))
```

## Workflow: a `code-review` run, end to end

Lore's smallest line. A PR is opened on `github.com/re-cinq/lore`.

**1. Start.** Something posts to `/assembly-lines/code-review/start`:

```json
{ "args": { "repo":   { "kind": "git", "ref": "github.com/re-cinq/lore@9e1f" },
            "pr_url": { "kind": "value", "ref": "https://github.com/re-cinq/lore/pull/412" } } }
```

The store checks no open run holds subject `pr_url:…/pull/412`, writes the
run row, and posts `node.review.start` with the run id.

**2. Open.** The run row and `node.review.start` were written in one
transaction. The loop claims the event. The handler resolves the `review`
station's latest version, its `reviewer` agent definition with this repo's
variant (sonnet instead of gemini), the needs `workspace` and `pr_url` from
the bag, and a deadline 20 minutes out. Visit 1 opens with a token.

**3. Dispatch.** Opening the visit enqueued `station_run.dispatch` with the
station's tags. A cluster agent with those tags claims it and creates a job
with `FLOOR_BRIEF_URL` and `FLOOR_TOKEN`. The wrapper fetches the brief and clones the repo at the sha to
`/work/repo`.

**4. Work.** The agent reviews. It writes findings to `/work/out/findings.json`
and prints a `REVIEW_RESULT: changes_requested` line.

**5. Report.** The wrapper uploads the findings file with `POST /blobs`, gets
hash F, and posts `station_run.reported`:

```json
{ "outcome": "changes_requested",
  "produced": { "review_findings": "F", "review_verdict": "changes_requested" } }
```

**6. Advance.** The handler writes the report on visit 1, then asks the
kernel: `review` finished with `changes_requested`, the edge leads to `done`.
It posts `node.done.start`.

**7. Settle.** `done` names no station, so it is a marker: visit 2 opens and reports success in one
transaction. The kernel says `finish`. The run is settled with outcome
`success`.

Rows at the end:

```
assembly_runs   id=R  line=code-review@L  repo=github.com/re-cinq/lore  subject=pr_url:…/412  status=finished  outcome=success
station_runs    1  R  review  iter 1  station=S1  agent=A1  report={changes_requested, produced:{review_findings:F, review_verdict:…}}
                2  R  done    iter 1  (marker)             report={success}
events          node.review.start · station_run.dispatch · station_run.reported · node.done.start
```

If instead the agent had crashed, the pod wrapper reports `failed`, the edge
`review → review, on failed, iteration_max 1` opens visit `(R, review, 2)`,
and a second crash fails the run with outcome `iteration_max`.

## Workflow: a run that waits for people, `feature-planning`

1. Start with `plan_id` as subject. `node.analyze.start` opens visit 1 of
   `analyze`; the agent drafts `plan.md`, produces `plan`.
2. Edge to `author`. Visit 1 of `author` opens: human kind, nothing is
   dispatched, the route resolves to the plan page. The run now sits here.
3. A person opens the page. The page shows the plan from the bag. They
   click Validate: the page posts `manual.plan.validate` with the run id.
   Because that start comes from outside, the store first closes `author`
   visit 1 as `cancelled`. Visit 1 of `validate` opens, an agent checks the
   plan, reports success with `findings`. Its `always` edge opens `author`
   visit 2, and the page shows the findings.
4. They click Refine on a section: the page uploads the edited plan and
   posts `station_run.reported` on `author` visit 2 with
   `changes_requested`. Edge to `analyze`. Visit 2 of `analyze` opens; its
   station has `conversation: continue` keyed on `plan_id`, so the brief
   carries visit 1's session ref and the agent continues where it left off.
5. Back to `author`, visit 3. They click Approve: `success`. Edge to
   `analyse-specs`, and the line runs on through `write`, `push`, and stops
   again at `merged`, a human node whose route is the GitHub PR page.
6. Days later the PR merges. GitHub's webhook becomes `github.pr.merged`
   with the PR URL. The handler finds the open run by subject, reports
   success on the `merged` visit, and the line continues to `decompose`,
   `issues`, `done`.

Every one of those pauses is a visit with status `open` on a human station.
Nothing is parked, resumed, or cloned; the run just has an open visit until a
person or a webhook reports on it.

## Actions

| action | what happens |
|---|---|
| `cancel` | status `cancelled`; queued events for the run dropped; open visits aborted best effort, reaped at deadline |
| retry, manual start | post the node's start event with the run id; the visit opens at the next iteration |
| reaper | any visit past its deadline is reported `failed` with `error: timeout` |
