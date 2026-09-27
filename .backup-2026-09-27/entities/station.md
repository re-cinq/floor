# Station

**One unit of work, defined once, reused by many lines.** A station is two
things: a **definition** (what it needs, what it produces, which agent
definition it runs with) and an **implementation** of one interface (how it
turns a brief into a report). The line decides *when* it runs and what comes
after; the station never knows.

## What it is not

- Not a node. A node is one *use* of a station inside one line.
- Not a prompt or a model. Those live in the agent definition it references.
- Not a running thing. One execution inside one run is a **station run**, a
  visit. See [assembly-run.md](assembly-run.md).

## The definition

Authored YAML, versioned by content hash. This is all a station author writes.

```yaml
name: review
kind: agent                            # agent | service | human
agent_definition: reviewer             # agent kind only: model, prompt, timeout, image
conversation: new                      # agent kind only: new | continue
tags: [gke-main]                       # agent kind only: which cluster agents may claim its visits
needs:
  - { name: workspace, kind: git,   path: /work/repo }          # access: read is the default
  - { name: pr_url,    kind: value }
produces:
  - { name: review_verdict,  kind: value }
  - { name: review_findings, kind: file, path: /work/out/findings.json }
```

| field | meaning |
|---|---|
| `name` | the id a node points at |
| `kind` | which implementation runs it: `agent`, `service`, `human` |
| `needs` / `produces` | items read from and written to the run's bag, by name and kind |
| `agent_definition`, `conversation`, `tags` | agent kind only |
| `access` on a `git` need | `read` (default) or `write`; write lets the visit trade its token for a push credential |
| `url` | service kind only: where the floor posts the brief |
| `route` | human kind only: the page template a person works on |

`path` matters only to the agent kind, which has a filesystem.

## The interface

Every kind implements the same two-sided contract. The floor side starts and
stops work; the worker side turns a brief into a report.

```ts
// what the floor hands a station: only its declared needs, resolved
interface Brief {
  needs: Record<string, string>;     // value, blob URL, or "repo@sha", per the declared kind
  iteration: number;
}

// what a station hands back
interface Report {
  outcome: "success" | "changes_requested" | "failed";
  produced?: Record<string, string>; // declared produces: value, or the uploaded blob hash
  usage?: { inputTokens: number; outputTokens: number; costUsd: number; model: string };
  sessionRef?: string;               // conversation `continue`
  error?: string;
}

// the base every implementation extends
abstract class Station {
  constructor(readonly definition: StationDefinition) {}

  // floor side: begin work on an open visit. Must eventually cause exactly one
  // `station_run.reported` event for that visit, or the reaper will.
  abstract dispatch(visit: OpenVisit): Promise<void>;

  // floor side: best effort; the reaper is the guarantee
  abstract abort(visit: OpenVisit): Promise<void>;

  // worker side: the whole job of a station, from the author's point of view
  abstract handle(brief: Brief): Promise<Report>;
}
```

`OpenVisit` is the visit id, the brief, the resolved agent settings, the
visit token, and the deadline. A station author never sees it; only the
floor and the implementations do.

## The three implementations

### AgentStation, kind `agent`

The one the AI agent runs. **The author implements nothing.** The
implementation is generic and ships as the pod wrapper:

- `dispatch`: nothing to do. Opening the visit already enqueued
  `station_run.dispatch` with the station's `tags`. A cluster agent whose
  tags cover them claims it from the queue and creates the pod with
  `FLOOR_BRIEF_URL` and `FLOOR_TOKEN`; a failed launch is failed back to the
  queue and retried with backoff. On a dev machine the cluster is minikube
  and nothing else differs.
- `handle`, inside the pod: fetch the brief; for each need, fetch the blob to
  its `path`, or clone the repo at the sha; render the prompt from the agent
  definition against the needs, including the built-in `previous_error` and
  `previous_failures` when the prompt references them; run the agent; parse `LORE_NODE_RESULT:` /
  `REVIEW_RESULT:` from its output; for each produce, upload the file at its
  `path` and collect the hash; return the report. The wrapper posts it as
  `station_run.reported`, retrying with backoff until the deadline.
- Pushing: if a `git` need declares `access: write`, the wrapper trades the
  visit token for a short-lived token scoped to that one repo and configures
  git with it. Without the declaration the exchange is refused.
- Cost: the wrapper writes one `llm_call` record per model call as it
  happens, so a pod that dies mid-visit still leaves its costs behind.
- Conversation: with mode `continue`, the wrapper downloads the previous
  archive blob before the agent starts, and uploads the new archive after,
  putting its hash in `sessionRef`. It never continues from a failed visit.
- `abort`: delete the pod.

So "writing an agent station" is writing the YAML above and a prompt. The
node, the brief, the uploads and the report are handled for you.

### ServiceStation, kind `service`

A station that already sits next to its data, so no pod and no clone.

- `dispatch`: `POST <url>` with the brief as body and the visit token as
  bearer.
- `handle`: the service author implements this one function with a small
  SDK: `defineStation({ handle: async (brief) => report })`. The SDK does
  the HTTP, the blob fetches and uploads, and posts the report event. A
  service that calls a model returns `usage` on its report; that is the only
  way its cost is known.
- `abort`: nothing; the reaper enforces the deadline.

Lore's `merge_step`, `escalation_step`, `issues`, `comment-triage` and the
real `retrospective` are this kind.

### HumanStation, kind `human`

- `dispatch`: nothing runs. The route is rendered from the needs when a
  person opens the page.
- `handle`: the page. It shows the needs, offers actions, and each action
  posts a report: Refine is `changes_requested` with the edited file
  produced, Approve is `success`. A webhook can report too, for a PR page
  the platform does not own.
- `abort`: nothing. Human visits have no deadline.

### Markers are not stations

A node that names no station is a marker: its visit opens and reports
`success` in the same transaction, and nothing is dispatched. Every terminal
`done` node in lore is one. There is nothing to define or register.

## Examples from lore, converted

```yaml
# lore implementation.yaml node `implement`
name: implement
kind: agent
agent_definition: implementer
conversation: new
needs:
  - { name: workspace, kind: git,  path: /work/repo, access: write }   # it commits and pushes
  - { name: spec,      kind: file, path: /work/spec.md }
  - { name: review_findings, kind: file, path: /work/findings.json, optional: true }
produces:
  - { name: patch, kind: file, path: /work/out/patch.diff }
```

```yaml
# lore feature-planning.yaml node `analyze`
name: plan-analyze
kind: agent
agent_definition: feature-planner
conversation: continue
conversation_key: plan_id
needs:
  - { name: workspace, kind: git,  path: /work/repo }
  - { name: plan_id,   kind: value }
  - { name: plan,      kind: file, path: /work/plan.md, optional: true }
produces:
  - { name: plan,      kind: file, path: /work/plan.md }
```

```yaml
# lore feature-planning.yaml node `author`
name: plan-author
kind: human
route: /repos/{repo}/plans/{plan_id}
needs:
  - { name: repo,    kind: value }
  - { name: plan_id, kind: value }
  - { name: plan,    kind: file }
produces:
  - { name: plan,    kind: file }
```

```yaml
# lore merge.yaml node `close-issue`
name: close-issue
kind: service
url: https://stations.lore/api/stations/close-issue
needs:
  - { name: task_id, kind: value }
  - { name: pr_url,  kind: value }
```

## Workflow: one visit, any kind

1. A node's start event arrives. The store resolves the station version,
   its agent definition and repo variant, and each need from the bag.
2. A visit opens with a frozen brief, a token, and a deadline (none for
   human).
3. The floor calls `station.dispatch(visit)` for the station's kind.
4. Somewhere, `handle(brief)` runs: in a pod, in a service, or on a page.
5. Exactly one `station_run.reported` arrives for the visit. The store
   merges `produced` into the bag. The line decides what is next.
