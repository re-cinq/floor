---
title: Station
description: One unit of work, defined once and used by many assembly lines, done by an agent, a service or a person.
wordBudget: 400
sidebar:
  order: 3
---

A **station** is one unit of work. It lists the outcomes it can report, the items it needs and the items it produces. Many [assembly lines](/floor/concepts/assembly-line/) can use one station.

## Three kinds

| Kind | Who does the work | How the visit is reported |
| --- | --- | --- |
| `agent` | A model in a pod, run by a cluster agent that offers every tag of the agent's [definition](/floor/concepts/agent-definition/) | The agent ends its reply with a `LORE_NODE_RESULT:` line |
| `service` | A worker of yours that claims `station:<id>` | The worker posts a report |
| `human` | A person | A report, or an [event](/floor/concepts/events/) the node names in `reports` |

An agent's result line is described in [The prompt](/floor/specs/agent-file/#3-the-prompt).

Floor serves no page for a human station. Whoever runs the station builds the page a person acts through, and it answers with a report or an event.

## Node versus station

A station is the definition. A node is one use of it inside a line. A line can use one station at two nodes, and each node then opens its own visits.

A node adds what belongs to its place in the line. It can rename a need with `bind`, name its own start event, list the events that answer it in `reports`, or fan out over a list. The fields are in [Nodes](/floor/specs/pipeline-file/#23-nodes).

A **marker** is a node with no station. Its visit reports `success` at once. Use one for an exit, a fail node or a join.

## A station in a line

```yaml
stations:
  write-note:
    kind: agent
    agent_definition: note-writer
    outcomes: [success, failed]
    needs:
      - { name: topic, kind: value }
    produces:
      - { name: note, kind: file, path: note.md }
```

A station's id is its key under `stations`. `outcomes`, `needs` and `produces` are required. Every field is in [Stations](/floor/specs/pipeline-file/#4-stations).
