---
title: Ingest events from another service
description: Start an assembly run from a webhook of a service you do not control, once per delivery, with a small relay in front of floor.
wordBudget: 500
sidebar:
  order: 5
---

At the end, a webhook from a ticket tracker starts one run of a line called `triage`, and a retried delivery starts nothing more. Floor has no adapters and checks no signatures, so you run a relay in front of it.

## What the relay must do

| It | Because |
| --- | --- |
| Checks `X-Signature`, an HMAC-SHA256 of the body with a shared secret | Floor does not know the sender |
| Flattens the payload to top-level text fields | A [start template](/floor/specs/placeholders/#1-start-templates) cannot reach inside an object |
| Sets `dedupeKey` from `X-Delivery-Id` | A retried delivery is [one event](/floor/concepts/events/#dedupe) |
| Posts `ticket.created` to `POST /events` | Events enter floor there |

## The relay

<!-- generated:example:code/relay/relay.mjs -->

````js title="relay/relay.mjs"
import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

const { FLOOR_API_URL, FLOOR_SERVICE_TOKEN, RELAY_SECRET, PORT = "8200" } = process.env;
const UNAUTHORIZED = 401;
const ACCEPTED = 202;
const FLOOR_TIMEOUT_MS = 10000;

function isSignedBy(secret, body, signature = "") {
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"));
  const given = Buffer.from(signature);

  return given.length === expected.length && timingSafeEqual(given, expected);
}

function flattened({ ticket }) {
  return { ticketId: ticket.id, title: ticket.title, priority: ticket.priority, author: ticket.author.name };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);

  return Buffer.concat(chunks);
}

function postToFloor(payload, deliveryId) {
  return fetch(`${FLOOR_API_URL}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${FLOOR_SERVICE_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ name: "ticket.created", payload, dedupeKey: `ticket.created:${deliveryId}` }),
    signal: AbortSignal.timeout(FLOOR_TIMEOUT_MS),
  });
}

createServer(async (request, response) => {
  const body = await readBody(request);
  if (!isSignedBy(RELAY_SECRET, body, request.headers["x-signature"])) return response.writeHead(UNAUTHORIZED).end();

  const deliveryId = request.headers["x-delivery-id"];
  const floorResponse = await postToFloor(flattened(JSON.parse(body)), deliveryId);
  console.log(`delivery ${deliveryId}: floor answered ${floorResponse.status}`);
  response.writeHead(floorResponse.ok ? ACCEPTED : floorResponse.status).end();
}).listen(PORT, () => console.log(`relay listening on ${PORT}`));
````

<!-- /generated -->

## The line that starts on it

```yaml
start:
  on: [ticket.created]
  when:
    priority: high
  args:
    ticket_id: "{ticketId}"
    title: "{title}"
```

`ticket_id` and `title` are arguments of the line, and `ticket_id` is its subject. See [Start](/floor/specs/pipeline-file/#22-start).

## Try it

Start the relay in one terminal. It needs `FLOOR_API_URL` and `FLOOR_SERVICE_TOKEN`.

```sh
RELAY_SECRET=s3cret node relay.mjs
```

```text
relay listening on 8200
```

In another, sign a sample delivery and send it.

```sh
BODY='{"ticket":{"id":"T-42","title":"Login fails on Safari","priority":"high","author":{"name":"Ana","email":"ana@example.com"}}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac s3cret -hex | awk '{print $NF}')
curl -s -o /dev/null -w "%{http_code}\n" localhost:8200 -H "X-Signature: $SIG" -H "X-Delivery-Id: d-1" -d "$BODY"
```

```text
202
```

The relay says what floor answered, and floor has a run.

```text
delivery d-1: floor answered 201
```

```sh
curl -s "$FLOOR_API_URL/assembly-runs?line=triage" -H "authorization: Bearer $FLOOR_SERVICE_TOKEN"
```

```text
{"items":[{"id":"c9b3215e-...","lineId":"triage","subjectKey":"ticket_id:T-42","outcome":null,...}],"nextCursor":null}
```

A wrong `X-Signature` gets `401` and posts nothing.

## Send it twice

Send the same command again. The relay answers `202` and floor answers `201` again, but it holds one event under `ticket.created:d-1`.

```sh
curl -s "$FLOOR_API_URL/assembly-runs?line=triage" -H "authorization: Bearer $FLOOR_SERVICE_TOKEN" | grep -o '"subjectKey"'
```

```text
"subjectKey"
```

One run, not two.

## Filter on a field

The `when` above starts a run only for `priority: high`. A ticket with `priority: low` is still an event floor keeps, and no run starts. A field in `when` must be a top-level field the relay put there, so flatten what you filter on.
