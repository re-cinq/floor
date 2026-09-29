# Station

**One unit of work, defined once, reused by many lines.** A station is a
**definition** (what it needs, what it produces, which outcomes it can
report) and one **function** that turns a brief into a report. The line
decides when it runs and what comes after; the station never knows.

## What it is not

- Not a node. A node is one *use* of a station inside one line.
- Not a prompt or a model. Those live in the agent definition it references.
- Not a running thing. One execution inside one run is a **station run**, a
  visit. See [assembly-run.md](assembly-run.md).
- Not the ai-agent-subsystem's `Station`. That one is a pod runtime (an image
  and its resources). Where both appear, this doc says *subsystem station*.

## The definition

Authored YAML, versioned by content hash. This is all a station author writes.

```yaml
name: review
kind: agent                            # agent | service | human
agent_definition: reviewer             # agent kind only
conversation: new                      # agent kind only: new | continue
outcomes: [success, changes_requested, failed]
needs:
  - { name: workspace, kind: git,   path: repo }                # access: read is the default
  - { name: pr_url,    kind: value }
produces:
  - { name: review_verdict,  kind: value }
  - { name: review_findings, kind: file, path: out/findings.json }
```

| field | meaning |
|---|---|
| `name` | the id a node points at |
| `kind` | who does the work: `agent`, `service`, `human` |
| `outcomes` | what it may report; default `[success, failed]`. The line must have an edge for each |
| `needs` / `produces` | items read from and written to the run's bag, by name and kind |
| `access` on a `git` need | `read` (default) or `write`; what the visit's token is traded for when git asks: a credential that reads the repository, or one that may push to it |
| `must_change` | agent kind: a `success` with no diff on the branch is recorded as `failed` |
| `agent_definition`, `conversation`, `conversation_key` | agent kind only |
| `route` | human kind only: the page template a person works on |

`path` is relative to the pod's workspace, `/workspace`, and matters only
to the agent kind. The prompt gets each one as `{<name>_path}`, in full.

A file an agent produces is one it wrote at `path`, or, with
`from: output` in place of a path, everything it said last. The second is
for a prompt that answers in its output, which the next station then reads
as a file.

> **Not built yet.** `must_change` is accepted and ignored.

`route` is stored for whoever builds a human station's page and is never
rendered by the floor, which serves no page of its own.

## The interface

```ts
interface Brief {
  needs: Record<string, string>;     // the value, or a URL to fetch
  iteration: number;
}

interface Report {
  outcome: string;                   // one of the station's declared outcomes
  produced?: Record<string, string>; // the value, or the blob hash
  sessionRef?: string;
  error?: string;
}

type Handle = (brief: Brief) => Promise<Report>;
```

That is the whole interface. Every kind is a different way of running that
one function. There is no floor-side class: the floor never starts a
station, it enqueues `station_run.dispatch` and a worker pulls it.

## The three kinds

### agent

**The author implements nothing, and no code of ours runs in the pod.** A
cluster agent claims the dispatch and creates one `Agent` resource of the
ai-agent-subsystem, translating the brief:

| in the brief | in the `Agent` resource |
|---|---|
| a `git` need | a repo to clone, at the branch, with a token secret |
| a `file` need | a file to download to `path` |
| a `value` need | a parameter that fills the prompt's `{placeholder}` |
| anything with a path | a parameter, `{<name>_path}`: where it is in the workspace |
| a `file` produce | a watched path, uploaded to the blob store when the agent ends |
| the previous conversation | restored before the agent starts, saved after |
| turns, cost, the result | streamed to the visit's sink endpoint |

The subsystem's supervisor does the fetching, cloning, prompt filling,
uploading and posting. The floor's sink endpoint turns those events, one
per request, into records, produced items and the report. A value the agent
produces goes in its marker, as JSON:
`LORE_NODE_RESULT: {"outcome":"success","produced":{"review_verdict":"approved"}}`.
Only what the station declares is taken. The outcome is parsed from the
agent's own output: `LORE_NODE_RESULT:` first, then `REVIEW_RESULT:`, then
`success`; a malformed marker is `failed`.

Writing an agent station is writing the YAML above and a prompt.

### service

A station that sits next to its data, so no pod and no clone.

```ts
import { defineStation } from "@re-cinq/floor-station";

defineStation("close-issue", async (brief, tools) => {
  await issues.close(brief.needs.issue_number);
  await tools.produce("summary", `closed ${brief.needs.issue_number}`);
  return { outcome: "success" };
});
```

The SDK claims `station_run.dispatch` events tagged `station:close-issue`
and calls the function with the brief and four tools: `read` fetches a file
need, `produce` uploads a file the station produces, `modelCall` records a
model call as `llm_call`, and `signal` is aborted at the deadline. It posts
what the function returns as the report; a function that throws has failed
its visit. When the floor cannot be reached the dispatch goes back to the
queue. The service needs only a way out to the floor; the floor never
calls it.

Lore's `merge_step`, `escalation_step`, `issues`, `comment-triage` and the
real `retrospective` are this kind. So is everything that talks to GitHub on
the floor's behalf: `open-pr`, `mark-ready`, `post-review`, `post-reply`.

### human

Nothing is dispatched. A human visit opens, waits with no deadline, and is
answered by a report or by an event its node's `reports` names.

**The floor serves no page, by design.** Whoever maintains a human station
builds whatever a person acts through, exactly as the maintainer of a
service station writes its worker. The floor offers only what that page
needs of it: the visit and its needs to read, `route` stored on the node for
the page's own use, and a report or a named event to answer with. It renders
nothing and calls nothing out.

A page built this way shows the needs and offers actions, each posting a
report: Refine is `changes_requested` with the edited file produced, Approve
is `success`. A webhook can answer instead, for a page the platform does not
own, like a GitHub PR.

### Markers are not stations

A node that names no station is a marker: its visit opens and reports
`success` in the same transaction. Every terminal `done` node in lore is
one. There is nothing to define or register.

## Examples from lore, converted

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

## Workflow: one visit, any kind

1. A node's start event arrives. The store resolves the station version,
   its agent definition and repo variant, and each need from the bag.
2. A visit opens with a frozen brief and a deadline, and, for agent and
   service kinds, a `station_run.dispatch` event in the same transaction.
   Its token is minted when its brief is asked for.
3. A worker claims the dispatch. For human, a person opens the page.
4. `handle(brief)` runs: in a pod, in a service, or on a page.
5. Exactly one `station_run.reported` arrives. The store merges `produced`
   into the bag and writes the next start event. The line decides what is
   next.
6. The worker that claimed the dispatch is told to let go, by
   `station_run.abort`.
