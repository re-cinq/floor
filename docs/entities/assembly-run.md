# Assembly run

An assembly run is one execution of one assembly line version. It holds a reference to the assembly line, the start arguments, and an ordered list of **station runs** (visits). Everything else about a run (its status, its current node, the bag of items stations pass along) is derived from those visits.

## What it is not

- Not editable. No PUT, no DELETE. It is an audit trail.
- Not a copy of the assembly line. It references `(line id, hash)`. The version is immutable, so the reference is enough.
- Not where bytes live. Files are hashes into the blob store.

## Fields

| field | meaning |
|---|---|
| `id` | uuid |
| `lineId`, `lineHash` | which assembly line, which version |
| `repo` | `host/owner/name`. Selects agent definition variants. `null` for a run that belongs to no repository, which is one started with none on a line that has no `git` argument |
| `subjectKey` | what the run works on. At most one open run per `(repo, subjectKey)`, runs with no repo counted together |
| `startItems` | the arguments and line-shipped files, the seed of the bag |
| `outcome` | empty while the run is open, then `success`, `failed`, `iteration_max`, `error` or `cancelled`. Empty again once a start by hand reopens it |
| `createdAt` | when the run began. The run list is ordered by it, newest first |
| `finishedAt` | empty while the run is open, and again once it is reopened |

## Station run (a visit)

One station executing once inside one run, identified by `(run, node, iteration)`. A node visited three times has three visits.

| field | meaning |
|---|---|
| `id` | station_run_id. Logs, telemetry, blobs and the token key on it |
| `nodeId`, `iteration` | which node, which visit of it |
| `stationHash`, `agentDefinitionHash` | what ran |
| `brief` | frozen at open: the needs as resolved from the bag |
| `report` | empty while the visit is open, written once: outcome, produced items, session ref, error |
| `worker` | who claimed it: pod, service, or person |
| `deadline` | opened at, plus the queue wait, plus the resolved timeout. Also the token's expiry. None for human |
| cost | derived: the sum of the visit's `llm_call` records |

## The bag

The bag is the items a run's stations pass to each other. It is seeded from `startItems`, then every done visit's `produced` is merged in visit order, and later wins. Each item remembers which visit wrote it. The bag is computed at read and never stored.

```
bag(run) = fold(startItems, visits.filter(done).map(v => v.report.produced))
```

## Workflow: a `code-review` run, end to end

This is a run of lore's smallest assembly line. A PR is opened on `github.com/re-cinq/lore`.

**1. Start.** GitHub's webhook arrives as `github.pull_request.opened`. The assembly line declares it as a start event, so the handler maps the payload to arguments and starts a run:

```json
{ "repo":   { "kind": "git",   "ref": "github.com/re-cinq/lore@fix/typo", "sha": "9e1f" },
  "pr_url": { "kind": "value", "ref": "https://github.com/re-cinq/lore/pull/412" } }
```

No open run holds subject `pr_url:…/pull/412`, so the store writes the run row, `internal.run.started` and `node.review.start` in one transaction. A second webhook for the same PR would join this run instead.

**2. Open.** The loop claims `node.review.start`. The handler resolves the `review` station's latest version, its `reviewer` agent definition with this repo's variant (sonnet instead of gemini), the needs `workspace` and `pr_url` from the bag, and a deadline of queue wait plus 20 minutes. Visit 1 opens with a token.

**3. Dispatch.** Opening the visit enqueued `station_run.dispatch` tagged `kind:agent`. A cluster agent claims it and creates one `Agent` resource. It carries the repo to clone at `9e1f`, `pr_url` as a parameter, `out/findings.json` as a watched file, and the visit's sink as the output. The ai-agent-subsystem starts the pod.

**4. Work.** The agent reviews. It writes `out/findings.json` and prints a `REVIEW_RESULT: changes_requested` line. Each model call reaches the sink as it happens and becomes an `llm_call` record.

**5. Report.** The supervisor uploads the findings file to the blob store and sends the file event, with sha256 F, then the terminal event. The sink parses the verdict and enqueues `station_run.reported`:

```json
{ "outcome": "changes_requested",
  "produced": { "review_findings": "F", "review_verdict": "changes_requested" } }
```

**6. Advance.** The handler writes the report on visit 1, then asks the kernel. `review` finished with `changes_requested`, and the edge leads to `post-review`. Visit 2 opens, a service claims it and posts the review to GitHub. Its edge leads to `done`.

**7. Settle.** `done` names no station, so it is a marker. Visit 3 opens and reports success in one transaction. The kernel says `finish`. The run is settled with outcome `success`, and `internal.run.settled` is written with it. An assembly line that publishes the GitHub check has its runs start on that event.

Rows at the end:

```
assembly_runs   id=R  line=code-review@L  repo=github.com/re-cinq/lore  subject=pr_url:…/412  outcome=success
station_runs    1  R  review       iter 1  station=S1  agent=A1  report={changes_requested, produced:{review_findings:F, …}}
                2  R  post-review  iter 1  station=S2            report={changes_requested}
                3  R  done         iter 1  (marker)              report={success}
events          github.pull_request.opened · internal.run.started · node.review.start · station_run.dispatch ·
                station_run.reported · node.post-review.start · station_run.dispatch · station_run.reported ·
                node.done.start · internal.run.settled
```

If the agent had crashed instead, the sink's terminal event is `failed`, the edge `review → review, on failed, iteration_max 1` opens visit `(R, review, 2)`, and a second crash fails the run with outcome `iteration_max`.

## Workflow: a run that waits for people, `feature-planning`

1. Start with `plan_id` as subject. `node.analyze.start` opens visit 1 of `analyze`. The agent drafts `plan.md` and produces `plan`.
2. Edge to `author`. Visit 1 of `author` opens. It is human kind, so nothing is dispatched, and the route resolves to the plan page. The run now sits here.
3. A person opens the page, which shows the plan from the bag. They click Validate, and the page posts `manual.plan.validate` with the run id. Because that start comes from outside, the store first closes `author` visit 1 as `cancelled`. Visit 1 of `validate` opens, an agent checks the plan and reports success with `findings`. Its `always` edge opens `author` visit 2, and the page shows the findings.
4. They click Refine on a section. The page uploads the edited plan and posts `station_run.reported` on `author` visit 2 with `changes_requested`. Edge to `analyze`. Visit 2 of `analyze` opens. Its station has `conversation: continue` keyed on `plan_id`, so the brief carries visit 1's session ref and the agent continues where it left off.
5. Back to `author`, visit 3. They click Approve, which is `success`. Edge to `analyse-specs`, and the run goes on through `write`, `push`, `open-pr` and `mark-ready`, and stops again at `merged`, a human node whose route is the GitHub PR page.
6. Days later the PR merges. GitHub's webhook arrives as `github.pull_request.closed`. The `merged` node declares that event in its `reports`, with `merged: true` meaning `success`. The run is found by its subject, the report is written on the open visit, and the run continues to `decompose`, `issues`, `done`.

Every one of those pauses is a visit with status `open` on a human station. Nothing is parked, resumed or cloned. The run has an open visit until a person or a webhook reports on it.

## Actions

| action | what happens |
|---|---|
| `cancel` | the run is settled as `cancelled`, its queued events are dropped, and each open visit gets a `station_run.abort` for whoever claimed it |
| retry, manual start | post the node's start event with the run id, and the visit opens at the next iteration. On a finished run the run reopens first, its left-open visits closed as `cancelled`, `internal.run.reopened` posted, and it settles again when the walk ends |
| reaper | a visit past its deadline is reported `failed`, `error: timeout`. A dispatch nobody claimed is `failed`, `error: unclaimed` |
