---
title: Run floor and walk your first line
description: Start floor on your machine and take one assembly run from its event to success with curl.
wordBudget: 450
sidebar:
  order: 1
---

You will have floor running on your machine and one assembly run walked from start to `success` by hand. You need Node 22, Docker and `jq`.

## 1. Start floor

```sh
git clone https://github.com/re-cinq/floor.git && cd floor
npm install
npm run db:up
npm run db:migrate
npm run build
FLOOR_AGENTS=0 npm start
```

Floor serves `http://localhost:8180` with the token `floor-dev-token`. `FLOOR_AGENTS=0` skips the cluster, which this line does not need. In a second terminal, in the same folder:

```sh
export FLOOR_API_URL=http://localhost:8180
export FLOOR_SERVICE_TOKEN=floor-dev-token
floor() { curl -s -H "authorization: Bearer $FLOOR_SERVICE_TOKEN" -H 'content-type: application/json' "$@"; }
```

## 2. Apply the collection

The collection `examples/first-run` holds one line. It starts on the event `greeting.requested`, takes the `name` from the payload, and has one `service` station that produces a `greeting`.

<!-- generated:example:first-run/first-run/assembly-line.yaml -->

````yaml title="first-run/assembly-line.yaml"
# yaml-language-server: $schema=https://re-cinq.github.io/floor/schemas/pipeline.schema.json
line:
  id: first-run
  entry: greet
  exit: done
  start:
    on:
      - greeting.requested
    args:
      name: "{name}"
  args:
    name:
      kind: value
      subject: true
  nodes:
    - id: greet
      station: greeter
    - id: done
  edges:
    - from: greet
      to: done
      on: success
stations:
  greeter:
    description: A worker of yours writes a greeting for the name.
    kind: service
    outcomes:
      - success
    needs:
      - name: name
        kind: value
    produces:
      - name: greeting
        kind: value
````

<!-- /generated -->

```sh
npx floor-pipeline apply examples/first-run
```

```text
examples/first-run:
  stations/greeter: changed
  assembly-lines/first-run: changed
```

## 3. Start a run

Post the event. The line's `start.args` fills `name` from the payload.

```sh
floor -X POST $FLOOR_API_URL/events -d '{"name":"greeting.requested","payload":{"name":"Grace"}}' | jq -c '{id,name,payload}'
```

```json
{"id":"61","name":"greeting.requested","payload":{"name":"Grace"}}
```

## 4. See the run

```sh
RUN=$(floor "$FLOOR_API_URL/assembly-runs?line=first-run" | jq -r '.items[0].id')
floor $FLOOR_API_URL/assembly-runs/$RUN | jq -c '{currentNode, outcome: .run.outcome, subjectKey: .run.subjectKey}'
```

```json
{"currentNode":"greet","outcome":null,"subjectKey":"name:Grace"}
```

The run waits at `greet`. No worker has claimed its visit.

## 5. Act as the worker

Claim the dispatch for `station:greeter`. Its payload names the visit.

```sh
CLAIM=$(floor -X POST $FLOOR_API_URL/events/claim -d '{"tags":["station:greeter"],"limit":1}')
DISPATCH=$(jq -r '.[0].id' <<<"$CLAIM")
VISIT=$(jq -r '.[0].payload.visitId' <<<"$CLAIM")
floor $FLOOR_API_URL/station-runs/$VISIT | jq '{nodeId, brief}'
```

```json
{
  "nodeId": "greet",
  "brief": {
    "needs": {
      "name": "Grace"
    },
    "iteration": 1
  }
}
```

Report the visit with an event, then ack the dispatch. See [Reporting a visit](/floor/specs/run-semantics/#31-reporting-a-visit).

```sh
floor -X POST $FLOOR_API_URL/events -d "{\"name\":\"station_run.reported\",\"payload\":{\"visitId\":\"$VISIT\",\"worker\":\"curl\",\"report\":{\"outcome\":\"success\",\"produced\":{\"greeting\":\"Hello, Grace\"}}}}" | jq -c '{id,name}'
floor -o /dev/null -w '%{http_code}\n' -X POST $FLOOR_API_URL/events/$DISPATCH/ack
```

```text
{"id":"74","name":"station_run.reported"}
204
```

## 6. See it settle

```sh
floor $FLOOR_API_URL/assembly-runs/$RUN | jq -c '{outcome: .run.outcome, bag}'
```

```json
{"outcome":"success","bag":{"name":{"by":"greeting.requested","ref":"Grace","kind":"value"},"greeting":{"kind":"value","ref":"Hello, Grace","by":"c7b312b6-90f7-47d1-afa7-905b043cccb4"}}}
```

The run is `success`, and its [bag](/floor/concepts/bag/) holds the `greeting` your visit produced. Next, [send events](/floor/tutorials/send-events/) that start and reach runs safely.
