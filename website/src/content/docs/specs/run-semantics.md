---
title: Run semantics
description: What the floor does with a line, from the event that starts a run to the outcome it ends with.
sidebar:
  order: 5
---

This page says what the floor does with a [pipeline file](/floor/specs/pipeline-file/) once it is applied. A line does no work. An assembly run is one execution of it, and a visit is one execution of one node.

## 1. Starting a run

An event starts a run of every line whose `start.on` lists the event's name and whose `start.when` matches its payload.

1. Each argument is filled from the payload by its [start template](/floor/specs/placeholders/#1-start-templates).
2. A start MUST give every argument the line declares. If not, the run does not start and the floor says `startItems.X: required by the line, as kind "K"`.
3. A start through `POST /assembly-lines/{id}/start` MAY give items the line does not declare as arguments, and they are kept in the run's bag. A start by event cannot: a `start.args` entry for a name the line does not declare is refused with `start maps "X", which the line does not declare as an argument`.
4. The run's repository is the one its `git` argument names. With no `git` argument it is the payload's `repo` or `repository` field, and with neither the run has no repository.
5. A line with a `git` argument MUST be started with a repository. The floor says `line "L" has a git argument, so a start must name its repo`.
6. A run walks the version of the line it started with. A newer version changes later runs only.

### 1.1 The subject

The argument marked `subject: true` gives the run its subject key, `<argument>:<value>`. For the argument `pr_url` it is `pr_url:https://github.com/acme/shop/pull/7`.

One open run exists for a repository and a subject key. A start that would make a second one joins the open run and starts nothing.

## 2. Events for a running run

An event names a run by `runId` in its payload, or by `subjectKey` and `repo`. An event with a `subjectKey` and no `repo` names a run that has no repository.

| The event's name is | The floor |
| --- | --- |
| A node's `start`, by default `node.<id>.start` | Opens a visit at that node |
| The `on` of one of a node's `reports`, with its `when` matching | Reports that entry's `outcome` for the visit waiting at the node |

A report from an event needs a visit that is open at the node. With none, nothing happens.

A start for a node that already has an open visit, sent with no iteration (a start by hand), returns that visit and opens nothing. The walk itself opens no visit while any visit of the run is open. A start that names another iteration of a node with an open visit is refused with `node "N" already has an open visit, iteration I`. The run and its open visit stay as they were. The branches of a [fan-out](#6-fan-out) share one iteration, so they open side by side.

## 3. A visit

When the walk reaches a node, a visit opens.

| The node has | What happens |
| --- | --- |
| No station | The visit reports `success` at once |
| An `agent` station | A cluster agent that offers every tag runs the agent in a pod |
| A `service` station | A worker that claims `station:<id>` does the work and reports |
| A `human` station | The visit waits for a report, or for an event one of the node's `reports` names |

Each need of the station is filled from the run's bag when the visit opens, and stays as it was filled. When a required need is not in the bag, the visit is refused with `node "N": missing required need(s) X`, no visit is recorded, and the run ends as `error` with that message as its reason.

| Station | A visit's deadline |
| --- | --- |
| `agent` | 30 minutes of waiting to be claimed, plus the agent's `timeout_minutes` |
| `service` | 60 minutes |
| `human` | None |

A visit past its deadline has `failed`. A visit no worker claims in 30 minutes has `failed` with `unclaimed: no worker offers ...`.

### 3.1 Reporting a visit

A visit ends when it is reported. An agent's visit is reported from what the agent says, as described in [Agent file](/floor/specs/agent-file/#3-the-prompt). A worker or a page a person acts through reports with an event.

```json
{
  "name": "station_run.reported",
  "payload": {
    "visitId": "0b6f4c1e-8a57-4a3c-9d2e-5f1c7a9b3e10",
    "worker": "ticket-tracker",
    "report": { "outcome": "success", "produced": { "note_url": "https://notes.example/42" } }
  },
  "dedupeKey": "station_run.reported:0b6f4c1e-8a57-4a3c-9d2e-5f1c7a9b3e10"
}
```

1. `outcome` is any text that is not empty. Use one the station lists, so that an edge exists for it.
2. `produced` is name to text. A `file` is given as the hash `POST /blobs` answered.
3. `error` MAY say why a visit `failed`. It is what a retry is given as `{previous_error}`.

## 4. The next node

When a visit reports, what it produced goes into the bag and the floor picks one edge that leaves the node.

1. An edge whose `on` equals the outcome is taken.
2. With none, an edge whose `on` is `always` is taken.
3. With neither, the run halts.

An edge with `iteration_max: N` can be taken N times in one run. When it is needed once more, the run ends with the outcome `iteration_max`. The walk does not go on to the fail node.

A node visited again opens a new visit. On an `agent` station, that visit is given [`{previous_error}` and `{previous_failures}`](/floor/specs/placeholders/#2-prompt-placeholders).

## 5. How a run ends

| The run | Its outcome | Its reason |
| --- | --- | --- |
| Reaches the `exit` node | `success` | |
| Reaches the `fail` node | `failed` | The visit that led there |
| Needs an edge whose `iteration_max` is spent | `iteration_max` | The edge |
| Has no edge for an outcome | `error` | `no edge from "X" for outcome "O"` |
| Makes 200 visits with no person acting | `error` | `maxNodes (200) reached without hitting exit or a person acting` |

The floor then sends the event `internal.run.settled`, with `runId`, `lineId`, `repo`, `subjectKey`, `outcome`, `reason` and `args` in its payload. A line can start on it. A line does not start on an `internal.*` event of its own runs.

## 6. Fan-out

A node with `fanout` produces a list, and the node `fanout.to` runs once for each entry.

1. The list is the `value` named by `fanout.over`. It MUST be a JSON array of strings.
2. An entry that is not a string is dropped. Text that is not a JSON array is an empty list.
3. Each branch is a visit of the body with the entry as its `item` need. The body's station lists `item` among its `needs`, with kind `value`.
4. The walk goes on from the body, by the body's own edges, when every branch has reported. The branches count as one visit of the body. Its outcome is `success` when every branch reported `success`, and `failed` otherwise, whatever else a branch reported. It is decided when all have reported, so a failed branch does not cancel the others.
5. A later need with `collect: <name>` is a JSON array of what each branch of the latest round produced under that name, in the order of the list. A produced value is taken as it is, and a produced file as its text.
6. An empty list runs no branch, and the walk goes on as if the body reported `success`.

Keep entries small, such as names or ids, and let the body read what it needs from the bag by them.

## 7. Conversations

An `agent` station with `conversation: continue` resumes an earlier conversation of the same node.

| The station sets | The conversation resumed |
| --- | --- |
| No `conversation_key` | The one of this node's last visit in this run that did not fail |
| `conversation_key: <name>` | The one of this node in a run on the same repository whose bag holds the same value under that name |

With none to resume, the agent starts a new conversation.

## 8. Agent settings

A visit of an `agent` station runs the agent's settings as they are when the visit opens. When the run has a repository and the agent has a variant for it, the variant is laid over the settings by field, by key of `config` and by model of `prices`.

The agent definition MUST exist when the visit opens. If not, the visit is refused with `no agent definition "X"`, and the run ends as `error` with that message as its reason.
