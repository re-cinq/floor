---
title: Pipeline file
description: The YAML file that defines an assembly line, its stations and its schedules.
sidebar:
  order: 1
---

A pipeline file is one YAML file that holds an assembly line and the stations it uses. This page says what the file may contain and what the floor refuses.

The words MUST, MUST NOT, SHOULD and MAY are used as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). "Refused" means nothing of that definition is stored. The floor answers `400`, and `floor-pipeline` prints the reason and exits with 1.

A JSON Schema of the file is at [`/floor/schemas/pipeline.schema.json`](/floor/schemas/pipeline.schema.json).

## 1. The file

The file MUST be YAML and its top level MUST be a map with only these keys.

<!-- generated:fields:pipeline -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `line` | object | no | The assembly line. A file with none carries only stations, agent definitions, schedules or an archive. |
| `stations` | map of object | no | The stations, by id. |
| `agent_definitions` | map of object | no | The agent definitions, by id. A collection refuses this block and defines each agent in its own file. |
| `schedules` | map of object | no | The schedules, by name. Each sends the event `schedule.<name>.tick`. |
| `archive` | object | no | What importing this file takes away from the floor. |

<!-- /generated -->

1. An unknown top-level key MUST NOT appear. The file is refused with `not a pipeline file: the file: Unrecognized key: "<key>"`.
2. Field names are written in `snake_case`. Names you choose, such as a node id or a key of `env`, are kept as written.
3. A station's id is its key under `stations`. A schedule's name is its key under `schedules`.

## 2. The line

<!-- generated:fields:line -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | The line's id. In a collection it equals the name of the folder the file is in. |
| `entry` | string | yes | The node a run starts at. |
| `exit` | string | yes | The node that ends a run as `success`. |
| `fail` | string | no | The node that ends a run as `failed`. With none, no node can. |
| `start` | object | no | The events that start a run of this line, and how their payload fills its arguments. With none, a run starts only by `POST /assembly-lines/{id}/start`. |
| `args` | map of object | yes | The arguments a start gives, by name. Each becomes an item of the run's bag under that name. |
| `files` | map of string or object | no | Files put in the bag of every run at its start, by item name. A file is written as its text, or as `{ base64: ... }` for bytes that are not text. |
| `nodes` | list of object | yes | The nodes of the line. |
| `edges` | list of object | yes | Which node follows which, by outcome. |

<!-- /generated -->

### 2.1 Arguments

Each entry of `args` is one argument.

<!-- generated:fields:line.arg -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | `value`, `file` or `git` | yes | The kind of item a start gives for this argument. |
| `subject` | boolean | no | Marks the argument whose value names what the run is about. One open run exists for a repo and a subject. A second start with the same value joins that run. |

<!-- /generated -->

At most one argument MAY set `subject: true`. A [collection](/floor/specs/collection/) requires exactly one.

### 2.2 Start

<!-- generated:fields:line.start -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `on` | list of string | yes | Names of the events that start a run of this line. A name matches exactly. |
| `when` | map of string, number or boolean | no | Payload fields that must equal these values. Each is a top-level field of the event's payload, compared as text. A field the payload lacks does not match. |
| `args` | map of string | yes | Argument name to a template, filled from the top-level fields of the event's payload, such as `{pr_url}`. |

<!-- /generated -->

Every key of `start.args` MUST be a declared argument. The templates are described in [Placeholders](/floor/specs/placeholders/#1-start-templates).

### 2.3 Nodes

<!-- generated:fields:node -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | yes | The node's name, unique in the line. |
| `station` | string | no | The station this node runs. A node with no station is a marker and reports `success` at once. `name@hash` pins one version of the station. |
| `start` | string | no | Name of the event that opens this node in a run. Defaults to `node.<id>.start`. |
| `bind` | map of string | no | Need name to bag item name, for a need the bag holds under another name. |
| `reports` | list of object | no | Events that answer a visit waiting at this node, in place of a report from the station's worker. |
| `fanout` | object | no | Runs another node once for each entry of a list this node produces. The walk goes on past that node when every branch has reported. |

<!-- /generated -->

An entry of `reports`:

<!-- generated:fields:node.report -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `on` | string | yes | Name of the event that answers a visit waiting at this node. |
| `when` | map of string, number or boolean | no | Payload fields that must equal these values. Each is a top-level field of the event's payload, compared as text. A field the payload lacks does not match. |
| `outcome` | string | yes | The outcome the visit reports when the event arrives. |

<!-- /generated -->

`fanout`:

<!-- generated:fields:node.fanout -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `over` | string | yes | The value this node's station produces that holds the list, a JSON array of strings. |
| `to` | string | yes | The node that runs once for each entry of the list, with the entry as its `item` need. |

<!-- /generated -->

### 2.4 Edges

<!-- generated:fields:edge -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `from` | string | yes | The node the edge leaves. |
| `to` | string | yes | The node the edge enters. |
| `on` | string | yes | The outcome that takes this edge, or `always` for any outcome. An edge on the exact outcome wins over `always`. |
| `iteration_max` | integer above 0 | no | How many times one run may take this edge. A run that needs it once more halts. |

<!-- /generated -->

## 3. Rules of a line

The floor checks a line when it is put, against the stations it holds at that moment. It reports every problem at once.

| Rule | The floor says |
| --- | --- |
| `entry`, `exit` and `fail` MUST each name a node. | `entry "X" is not a node` |
| `fail` MUST NOT be the entry or the exit. | `fail "X" is also the exit` |
| A node id MUST be unique. | `node id "X" is used more than once` |
| Both ends of an edge MUST name a node. | `edge N: from "X" is not a node` |
| The exit and the fail node MUST NOT have an outgoing edge. | `edge N: exit "X" cannot have an outgoing edge` |
| Every other node MUST have an outgoing edge. | `node "X" has no outgoing edge` |
| Every node MUST be reachable from the entry, or from a node that sets `start`. | `node "X" is not reachable from entry "E"` |
| A node's `station` MUST be a station the floor holds. | `node "X" names unknown station "S"` |
| A node with `reports` MUST name a station. | `node "X" declares reports but names no station to wait at` |
| Every outcome a station lists MUST have an edge, or the node an `always` edge. | `node "X" has no edge for outcome "O"` |
| A cycle MUST contain an edge with `iteration_max` or a `human` station. | `cycle through "A", "B" has no iteration_max and no human node` |
| A key of `start.args` MUST be a declared argument. | `start.args names "X", which is not a declared argument` |
| At most one argument is the subject. | `more than one argument is marked subject` |

A station pinned as `name@hash` is not checked for outcomes and counts as a guard in a cycle.

## 4. Stations

<!-- generated:fields:station -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `kind` | `agent`, `service` or `human` | yes | Who does the work. `agent` is a model in a pod, `service` is a worker that claims visits, `human` is a person. |
| `description` | string | no | What the station does, for a person reading the line. The floor does not act on it, and changing it makes no new version. |
| `agent_definition` | string | no | Agent stations only. The id of the agent definition the station runs. |
| `conversation` | `new` or `continue` | no | Agent stations only. `continue` resumes the conversation of this node's last visit in the run that did not fail. |
| `conversation_key` | string | no | With `conversation: continue`. The name of a bag item. The conversation resumed is one from a run on the same repo that holds the same value under that name. |
| `outcomes` | list of string | yes | The outcomes the station reports. `failed` can be reported whether it is listed or not. |
| `must_change` | boolean | no | Accepted and not acted on. |
| `result_required` | boolean | no | Agent stations only. An agent that ends without stating a result has `failed`. Without it, silence is read as `success`. |
| `needs` | list of object | yes | The bag items a visit is given. |
| `produces` | list of object | yes | The bag items a visit writes. |
| `url` | string | no | Accepted and not acted on. |
| `route` | string | no | Human stations only. Kept for the page a person acts through. The floor does not read it. |

<!-- /generated -->

An entry of `needs`:

<!-- generated:fields:need -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The need's name. The bag item of the same name fills it, unless the node's `bind` names another. |
| `kind` | `value`, `file` or `git` | yes | The kind of item the need takes. |
| `path` | string | no | Agent stations only. Where the item is put in the pod, relative to `/workspace`. |
| `access` | `read` or `write` | no | `git` needs only. `write` lets the visit push to the repository. Defaults to `read`. |
| `optional` | boolean | no | The visit opens without the item when the bag does not hold it. |
| `collect` | string | no | `value` needs only. The name of an item the body of a fan-out produces. The need is filled with a JSON array of what each branch produced, in branch order. |

<!-- /generated -->

An entry of `produces`:

<!-- generated:fields:produce -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | The name of the bag item the station writes. |
| `kind` | `value` or `file` | yes | The kind of item written. |
| `path` | string | no | Agent stations only. The file the agent writes, relative to `/workspace`. |
| `from` | `output` | no | Agent stations only. The file is everything the agent said last. For kind `file`, and with no `path`. |

<!-- /generated -->

A produce with `from: output` MUST have kind `file` and MUST NOT have a `path`. The floor says `from: output is for a file, and takes no path`.

## 5. Rules of the bag

A need is filled from the run's [bag](/floor/concepts/bag/), the items a run has collected so far. The floor refuses a line in which a required need can be empty.

| Rule | The floor says |
| --- | --- |
| A need MUST be an argument, a line file, or produced on every path into the node. | `node "X" needs "n", which is not seeded at start and not produced on every path into it` |
| A `git` need MUST be a `git` argument. | `node "X" needs "n" as kind "git", which nothing in the line seeds` |
| A need of a node that sets `start` MUST be an argument or a line file. | `node "X" starts by its own event, so its need "n" must be seeded at start` |

These rules skip a need with `optional: true`, a need with `collect`, and the needs `previous_error`, `previous_failures` and `item`, which the floor fills.

## 6. Rules of a fan-out

| Rule | The floor says |
| --- | --- |
| `fanout.to` MUST name a node. | `node "X" fans out to "T", which is not a node` |
| `fanout.over` MUST be a `value` the node's station produces. | `node "X" fans out over "V", which its station does not produce as a value` |
| The node MUST have a `success` edge to `fanout.to`. | `node "X" fans out to "T" but has no success edge to it` |
| A node MUST be the body of one fan-out at most. | `node "T" is the body of more than one fan-out` |
| The body MUST NOT fan out itself. | `node "T" is the body of a fan-out and cannot fan out itself` |
| The body MUST have an edge for `failed`, or an `always` edge. | `node "T" is the body of a fan-out and needs an edge for failed` |
| A `collect` MUST name an item exactly one fan-out body produces. | `node "X" collects "c", which no fan-out body produces` |

## 7. Schedules

<!-- generated:fields:schedule -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `cron` | string | yes | When the schedule ticks, as a cron expression. |
| `timezone` | string | no | The timezone the expression is read in. Defaults to UTC. |
| `payload` | map of anything | yes | The payload of each `schedule.<name>.tick` event. The floor adds `scheduledFor`. |

<!-- /generated -->

The floor says `invalid cron expression` or `invalid timezone` for a value it cannot read.

A schedule starts nothing by itself. A line starts on its tick by listing `schedule.<name>.tick` in `start.on`. `payload` is REQUIRED and MAY be `{}`.

```yaml
line:
  id: weekly-summary
  start:
    on: [schedule.monday-morning.tick]
    args:
      week: "{scheduledFor}"
schedules:
  monday-morning:
    cron: "0 9 * * 1"
    timezone: Europe/Amsterdam
    payload: {}
```

## 8. Archive

<!-- generated:fields:archive -->

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `lines` | list of string | no | Ids of lines to archive. |
| `stations` | list of string | no | Ids of stations to archive. |
| `agent_definitions` | list of string | no | Ids of agent definitions to archive. |
| `schedules` | list of string | no | Names of schedules to archive. |

<!-- /generated -->

## 9. Example

<!-- generated:example:starter/write-note/assembly-line.yaml -->

````yaml title="write-note/assembly-line.yaml"
# yaml-language-server: $schema=https://re-cinq.github.io/floor/schemas/pipeline.schema.json
line:
  id: write-note
  entry: write
  exit: done
  fail: stopped
  start:
    on:
      - note.requested
    args:
      topic: "{topic}"
  args:
    topic:
      kind: value
      subject: true
  nodes:
    - id: write
      station: write-note
    - id: publish
      station: publish-note
    - id: done
    - id: stopped
  edges:
    - from: write
      to: publish
      on: success
    - from: write
      to: write
      on: failed
      iteration_max: 1
    - from: publish
      to: done
      on: success
    - from: publish
      to: stopped
      on: failed
stations:
  write-note:
    description: An agent writes one sentence about the topic into a file.
    kind: agent
    agent_definition: note-writer
    outcomes:
      - success
      - failed
    result_required: true
    needs:
      - name: topic
        kind: value
    produces:
      - name: note
        kind: file
        path: note.md
  publish-note:
    description: A worker of yours reads the note and publishes it.
    kind: service
    outcomes:
      - success
      - failed
    needs:
      - name: note
        kind: file
    produces:
      - name: note_url
        kind: value
````

<!-- /generated -->

## 10. Limits

- Inside `line`, a station or a schedule, the floor drops a key it does not know and says nothing. A misspelt `iteration-max` is an edge with no limit. The JSON Schema refuses unknown keys, and so does `floor-pipeline lint` on a [collection](/floor/specs/collection/#2-rules), as `unknown-key`. Check a file with one of them.
- A station can report `failed` whether it lists it or not. A node with no edge for `failed` halts the run when that happens. List `failed` in `outcomes`.
- `must_change` and `url` are accepted and do nothing. `route` is stored and never read by the floor.
- An edge's `on` is not checked against the station's outcomes by the floor. A collection's lint checks it.
- An agent station's `agent_definition` is checked when a visit opens, not when the station is put.
