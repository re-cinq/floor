---
title: Events
description: How anything reaches floor, and what floor posts back about its own runs.
wordBudget: 400
sidebar:
  order: 5
---

An **event** is a name and a payload that you post to floor with `POST /events`. Events start [assembly runs](/floor/concepts/assembly-run/) and move them on.

```json
{
  "name": "note.requested",
  "payload": { "topic": "tides" },
  "dedupeKey": "note.requested:tides:2026-11-23"
}
```

## What an event can do

| Its name is | What floor does |
| --- | --- |
| In a line's `start.on` | Starts a run, or joins the open run on the same subject |
| A node's `start`, by default `node.<id>.start` | Opens a visit at that node |
| The `on` of a node's `reports` | Answers the visit waiting at that node with that entry's `outcome` |
| `station_run.reported` | Reports a visit, with its outcome and what it produced |

A `when` on a start or a report matches fields of the payload. To reach a running run, the payload names it by `runId`, or by `subjectKey` and `repo`. See [Events for a running run](/floor/specs/run-semantics/#2-events-for-a-running-run).

## Events floor sends

A line can start on an `internal.*` or a `schedule.*` event. It never starts on an `internal.*` event of its own runs.

| Event | When |
| --- | --- |
| `internal.run.started` | A run starts |
| `station_run.dispatch` | A visit is ready for a worker to claim. Only a worker that offers its tags sees it |
| `internal.run.settled` | A run ends. The payload holds `runId`, `lineId`, `repo`, `subjectKey`, `outcome`, `reason` and `args` |
| `internal.run.reopened` | A settled run is reopened |
| `internal.cost.missing` | An agent visit made model calls that no price covers |
| `schedule.<name>.tick` | A [schedule](/floor/specs/pipeline-file/#7-schedules) ticks |

## Dedupe

`dedupeKey` makes a post safe to repeat. Two events with one key are one event, so a webhook that retries starts one run.

## Workers pull

Floor never calls out. A worker claims dispatches by offering tags, and an agent visit goes to a cluster agent that offers every tag of the agent. Nothing you run needs to be reachable from floor.
