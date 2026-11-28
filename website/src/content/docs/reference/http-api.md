---
title: HTTP API
description: The routes the floor serves, who may call each, and how a reader starts and reads an assembly run.
wordBudget: 400
sidebar:
  order: 3
---

Every route below is on the api, at `$FLOOR_API_URL`. Bodies are JSON in `camelCase`, and the YAML files are `snake_case`. Lists take `limit` up to 200 and a `cursor` to hand back unchanged, and some need a filter.

## Authentication

Send `authorization: Bearer <token>` with every call but the health routes and the key set. There are two tokens.

| Token | Who holds it | What it reaches |
| --- | --- | --- |
| The service token | You, a worker, the cluster agent, the CLI | Every route |
| A visit token | The agent pod of one visit | Only the routes marked "visit" below, and only for its own visit. It expires at the visit's deadline |

A missing or wrong token is `401`. A visit token on another route, or another visit, is `403`. A [gateway token](#gateway-tokens) is for another service, and is `401` on every route here.

## Errors

An error is `application/problem+json`. `errors` lists every problem of a refused body.

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "invalid start request",
  "errors": ["startItems.launch_id: required by the line, as kind \"value\""]
}
```

## Definitions

Assembly lines, stations and agent definitions share one set of routes. Replace `{kind}` with `assembly-lines`, `stations` or `agent-definitions`.

| Route | What it does | Who |
| --- | --- | --- |
| `GET /{kind}`, `GET /{kind}/{id}` | Lists the latest versions, or one | service |
| `GET /{kind}/{id}/versions`, `GET /{kind}/{id}/versions/{hash}` | Lists the versions, or one | service |
| `POST /{kind}` | Creates a definition | service |
| `PUT /{kind}/{id}` | Puts a version. The same content twice changes nothing | service |
| `DELETE /{kind}/{id}` | Archives it. `409` while an open run or a station still uses it | service |
| `GET /migrations`, `GET /migrations/{name}`, `PUT /migrations/{name}` | Reads and records the files `floor-pipeline migrate` ran | service |

## Runs

| Route | What it does | Who |
| --- | --- | --- |
| `POST /assembly-lines/{id}/start` | Starts a run, or joins the open run on the same subject | service |
| `GET /assembly-runs` | Lists runs. A filter is required: `line`, `open`, `repo`, `withoutRepo`, `subject` or `since` | service |
| `GET /assembly-runs/{id}` | The run, its bag, its current node and its cost | service |
| `POST /assembly-runs/{id}/cancel` | Settles the run as cancelled and aborts its open visits | service |
| `GET /assembly-runs/{id}/live` | A WebSocket that replays and follows one run | service |
| `GET /costs` | Cost by `group`, with a filter | service |

Start a run with one item per argument of the line.

```bash
curl -s -X POST -H "authorization: Bearer $FLOOR_SERVICE_TOKEN" \
  -H 'content-type: application/json' \
  $FLOOR_API_URL/assembly-lines/launch-approval/start \
  -d '{"startItems":{"launch_id":{"kind":"value","ref":"checkout-api","by":"start"}}}'
```

It answers `201`, or `200` with `"joined": true` when a run on that subject was open.

```json
{
  "run": {
    "id": "7f79b2c3-e0d7-42ba-a412-8db10407cf2f",
    "lineId": "launch-approval",
    "subjectKey": "launch_id:checkout-api",
    "startItems": { "launch_id": { "by": "start", "ref": "checkout-api", "kind": "value" } },
    "outcome": null,
    "finishedAt": null
  },
  "joined": false
}
```

`GET /assembly-runs/{id}` answers while the run waits at its first node.

```json
{
  "run": { "id": "7f79b2c3-e0d7-42ba-a412-8db10407cf2f", "outcome": null, "finishedAt": null },
  "bag": { "launch_id": { "by": "start", "ref": "checkout-api", "kind": "value" } },
  "currentNode": "product-review",
  "cost": null
}
```

## Visits

| Route | What it does | Who |
| --- | --- | --- |
| `GET /station-runs?run={id}` | Lists the visits of a run | service |
| `GET /station-runs/{id}` | One visit, with its outcome, deadline and cost | service |
| `GET /station-runs/{id}/brief` | What the visit needs, its settings, a fresh visit token and its gateway tokens | service, visit |
| `POST /station-runs/{id}/records`, `GET /station-runs/{id}/records` | Writes and reads its logs, turns and model calls | service, visit |
| `POST /station-runs/{id}/sink` | Takes the events of an agent's supervisor | service, visit |
| `POST /station-runs/{id}/git-credential` | A git credential for a repository the visit needs. `501` when none is configured | service, visit |
| `GET /conversations/{id}`, `POST /conversations/{id}` | Reads and saves a visit's conversation | service, visit |

## Events

| Route | What it does | Who |
| --- | --- | --- |
| `POST /events` | Posts an event. A visit token may post only `station_run.reported` for its own visit | service, visit |
| `GET /events`, `GET /events/{id}` | The feed, which needs `since`, `name`, `run` or `station-run`, and one event | service |
| `POST /events/claim` | A worker claims dispatches for the `tags` it offers | service |
| `POST /events/{id}/ack`, `POST /events/{id}/fail` | Settles a claimed event, or requeues it | service |

## Blobs

| Route | What it does | Who |
| --- | --- | --- |
| `POST /blobs` | Stores bytes and answers their sha256 | service, visit |
| `GET /blobs/{hash}` | Reads them. A visit token reads only the files its visit was given or uploaded | service, visit |

## Schedules

| Route | What it does | Who |
| --- | --- | --- |
| `GET /schedules`, `GET /schedules/{id}` | Lists schedules, or one | service |
| `POST /schedules`, `PUT /schedules/{id}`, `DELETE /schedules/{id}` | Creates, changes and removes one | service |
| `POST /schedules/{id}/trigger` | Ticks it now | service |

## Clusters

| Route | What it does | Who |
| --- | --- | --- |
| `PUT /clusters/{id}` | Registers a cluster with its `tags`, its build, its subsystem and its model catalog (`models`). The cluster agent calls it | service |
| `GET /agent-definitions/presence` | Which clusters hold which agent definitions, and whether their model catalogs can run each one's model (`modelAvailable`) | service |
| `GET /agent-definitions/{id}/clusters` | The clusters that hold one | service |
| `GET /agent-definitions/{id}/recipes` | The settings a visit of its latest version gets | service |

## Gateway tokens

An MCP server with a [`visit_token`](/floor/specs/agent-file/) gets a token the floor signs for each visit, in the brief's `serverTokens` under the server's name. It is a JWT signed with Ed25519 (`alg: EdDSA`), and its `kid` is the RFC 7638 thumbprint of the signing key.

| Claim | What it holds |
| --- | --- |
| `iss` | The floor's address, `FLOOR_BASE_URL` |
| `aud` | The audience the definition names |
| `sub`, `run` | The visit's id and its run's |
| `repo` | The run's repository, `host/owner/name` in lower case |
| `scope` | The definition's scopes, joined by single spaces |
| `iat`, `exp` | When it was signed and the visit's deadline, in seconds. Never more than 24 hours apart |

| Route | What it does | Who |
| --- | --- | --- |
| `GET /.well-known/jwks.json` | The public keys a token verifies with, the signing key first, then the retired ones | anyone |

The cluster agent writes each token of the brief into `agent-secrets` as `Bearer <token>`, under the key `visit-<visit id>-gateway-token.<server name>`, and the pod sends it to the server as its `Authorization` header. A token is not renewed: it expires at the visit's deadline, and a visit that runs again gets a new one.

The brief is `409` when the floor has no signing key, when the run names no such repository, or when the deadline is more than 24 hours away.

## Health

| Route | What it does | Who |
| --- | --- | --- |
| `GET /healthz`, `GET /readyz` | Answers while up, and while the database is reachable | anyone |
| `GET /version` | The build, the schema version, whether this replica runs the loop, and what each cluster runs, its model catalog included | anyone |
| `GET /metrics` | Prometheus metrics, listed in [Metrics](/floor/reference/metrics/) | anyone |
