---
title: Send events
description: Post an event that starts a run, post it twice safely, and post one that reaches a run that is already open.
wordBudget: 400
sidebar:
  order: 3
---

You will post an event that starts a run, repeat it without starting a second run, and send events that reach an open run. The commands assume the variables and the `floor` function from [Run floor and walk your first line](/floor/tutorials/first-run/).

## The request

| Field | Required | Holds |
| --- | --- | --- |
| `name` | yes | The event's name. A line starts on the names in its `start.on`. |
| `payload` | yes | A JSON object. A line's start templates and a run's `reports` read its top-level fields. |
| `dedupeKey` | no | A string. Two events with one key are one event. |
| `availableAt` | no | A time. The event is not available before it. |

## Start a run

The line `approval` starts on `doc.submitted` and has a `human` station at its node `review`. Adapt the line of the first tutorial to it.

```sh
floor -X POST $FLOOR_API_URL/events -d '{"name":"doc.submitted","payload":{"doc":"spec-7"},"dedupeKey":"doc.submitted:spec-7"}' | jq -c '{id,name,dedupeKey}'
```

```json
{"id":"85","name":"doc.submitted","dedupeKey":"doc.submitted:spec-7"}
```

```sh
RUN=$(floor "$FLOOR_API_URL/assembly-runs?line=approval" | jq -r '.items[0].id')
```

## Post it twice

Send the same request again. The answer is the same event, and no second run starts.

```json
{"id":"85","name":"doc.submitted","dedupeKey":"doc.submitted:spec-7"}
```

## Reach an open run

A node answers a waiting visit through its `reports`. This node answers two events, one per outcome.

```yaml
nodes:
  - id: review
    station: reviewer
    reports:
      - on: review.approved
        outcome: approved
      - on: review.rejected
        outcome: rejected
```

Name the run by its `runId` in the payload.

```sh
floor -X POST $FLOOR_API_URL/events -d "{\"name\":\"review.approved\",\"payload\":{\"runId\":\"$RUN\"}}" | jq -c '{id,name}'
floor $FLOOR_API_URL/assembly-runs/$RUN | jq -c '{outcome: .run.outcome}'
```

```json
{"id":"106","name":"review.approved"}
{"outcome":"success"}
```

Or name it by its `subjectKey` and `repo`. A run starts with a `repo` when the payload of its event has one.

```sh
floor -X POST $FLOOR_API_URL/events -d '{"name":"doc.submitted","payload":{"doc":"spec-8","repo":"github.com/acme/shop"}}' | jq -c '{id,name}'
floor -X POST $FLOOR_API_URL/events -d '{"name":"review.rejected","payload":{"subjectKey":"doc:spec-8","repo":"github.com/acme/shop"}}' | jq -c '{id,name}'
```

```json
{"id":"108","name":"doc.submitted"}
{"id":"111","name":"review.rejected"}
```

The run ends `failed`. [Events for a running run](/floor/specs/run-semantics/#2-events-for-a-running-run) has the rules.

## A refused request

A post without a `payload` is refused with `400` and a problem JSON.

```sh
floor -i -X POST $FLOOR_API_URL/events -d '{"name":"doc.submitted"}' | grep -E '^(HTTP|content-type|\{)'
```

```text
HTTP/1.1 400 Bad Request
content-type: application/problem+json
{"type":"about:blank","title":"Bad Request","status":400,"detail":"invalid event","errors":["payload: Invalid input: expected record, received undefined"]}
```

## An event that could not start its line

A valid post is accepted even when the line cannot start from it. Read the event to see why.

```sh
EVENT=$(floor -X POST $FLOOR_API_URL/events -d '{"name":"doc.submitted","payload":{"title":"x"}}' | jq -r .id)
floor $FLOOR_API_URL/events/$EVENT | jq -c '{deadAt, lastError}'
```

```json
{"deadAt":"2026-11-23T14:34:28.359Z","lastError":"line \"approval\": a template names {doc}, which is not there to fill it"}
```

`lastError` holds the reason and `deadAt` says floor has given up on the event.
