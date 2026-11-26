---
title: Write a custom station
description: Write a worker that floor hands work to, with the station SDK and as plain HTTP.
wordBudget: 500
sidebar:
  order: 4
---

For a first worker, start with [Build a Hello World station](/floor/tutorials/hello-world-station/). Here you will end with a worker of your own that floor hands work to, written once with the station SDK and understood once as plain HTTP. Set `FLOOR_API_URL` and `FLOOR_SERVICE_TOKEN` first.

## 1. Define the station

A `service` station with one `value` need and one `value` produce, and a line that uses it. Every outcome needs an edge. The fields are in [Stations](/floor/specs/pipeline-file/#4-stations).

```yaml
stations:
  shout:
    kind: service
    outcomes: [success, failed]
    needs:
      - { name: text, kind: value }
    produces:
      - { name: shouted, kind: value }
line:
  id: shout-line
  entry: shout
  exit: done
  fail: broken
  args:
    text: { kind: value, subject: true }
  nodes:
    - { id: shout, station: shout }
    - { id: done }
    - { id: broken }
  edges:
    - { from: shout, to: done, on: success }
    - { from: shout, to: broken, on: failed }
```

Save it as `shout.yaml` and import it with `npx @re-cinq/floor-pipeline import shout.yaml`.

## 2. Write the worker with the SDK

`defineStation` claims the visits of one station, calls your function with the brief and the tools, and posts what it returns.

<!-- generated:example:code/station/worker.ts -->

````ts title="station/worker.ts"
// Run this worker with the shout pipeline to turn a text input into an uppercase value.
// The pipeline uses the returned outcome to choose its next step and stores the shouted text.

import { defineStation } from "@re-cinq/floor-station";

// brief identifies the visit and carries its inputs; this pipeline supplies needs.text. https://re-cinq.github.io/floor/sdk/station/#brief
defineStation("shout", async (brief) => {
  const text = brief.needs.text;
  if (text === "") throw new Error("nothing to shout");

  console.log(`visit ${brief.visitId}: ${text}`);

  return { outcome: "success", produced: { shouted: text.toUpperCase() } };
});
````

<!-- /generated -->

The worker reads `FLOOR_API_URL` and `FLOOR_SERVICE_TOKEN`, and needs nothing else. Start a run in one terminal and the worker in another.

```
$ curl -X POST $FLOOR_API_URL/assembly-lines/shout-line/start -H "authorization: Bearer $FLOOR_SERVICE_TOKEN" -H 'content-type: application/json' -d '{"startItems":{"text":{"kind":"value","ref":"hello floor","by":"me"}}}'
$ npx tsx worker.ts
visit 0e9ccd6f-df9b-4015-bcf3-f41241b0ce86: hello floor
```

The run settles with `shouted` in its bag as `HELLO FLOOR`.

## 3. The same in plain HTTP

Every request carries the header `authorization: Bearer $FLOOR_SERVICE_TOKEN`. Take `$VISIT` from `payload.visitId` and `$EVENT` from `id` of the claimed event.

| Step | Request | What you get |
| --- | --- | --- |
| Claim | `POST /events/claim` with `{"tags":["station:shout"],"limit":1}` | `[{"id":"7","name":"station_run.dispatch","payload":{"visitId":"c7aa4d2b-..."},...}]` |
| Brief | `GET /station-runs/$VISIT/brief` | `{"visitId":"c7aa4d2b-...","nodeId":"shout","iteration":1,"deadlineMinutes":60,"needs":[{"name":"text","kind":"value","value":"hello floor"}],...}` |
| Report | `POST /events` with the event below | `201` and the stored event |
| Ack | `POST /events/$EVENT/ack` | `204` |

```json
{"name":"station_run.reported","payload":{"visitId":"c7aa4d2b-...","worker":"curl","report":{"outcome":"success","produced":{"shouted":"HELLO FLOOR"}}},"dedupeKey":"station_run.reported:c7aa4d2b-..."}
```

A later claim also returns a `station_run.abort` for a visit that has ended. Ack it too.

## 4. Files

A `file` need arrives in the brief as a `url`. The SDK gives you `tools.read(need)` for its bytes and `tools.produce(name, bytes)` to store a file. Over HTTP, read with `GET /blobs/{hash}` and store with `POST /blobs`, which answers `{"hash":"sha256-8f43...","size":2}`. Put that hash in `produced`.

## 5. A person's station

Floor serves no page for a `human` station. Your page reads the visit and reports the same way, or the node lists `reports` so an event answers it. See [Station](/floor/concepts/station/).

## 6. When the worker fails or is slow

Report `{"outcome":"failed","error":"cannot shout this"}` and the run takes the `failed` edge. The SDK does this when your function throws. A `service` visit has a deadline of 60 minutes, and a visit nobody claims fails after 30. See [A visit](/floor/specs/run-semantics/#3-a-visit).
