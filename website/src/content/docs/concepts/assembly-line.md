---
title: Assembly line
description: A versioned definition of nodes, edges and arguments that says what may happen in a run.
wordBudget: 400
sidebar:
  order: 1
---

An **assembly line** is a definition. It lists nodes, the edges between them, the arguments a run starts with and the events that start one. It describes work and does none.

## What a line holds

| Part | Meaning |
| --- | --- |
| `entry`, `exit`, `fail` | Where a run starts, where it ends as `success`, and where it ends as `failed` |
| `nodes` | Each node is one use of a [station](/floor/concepts/station/), or a marker with none |
| `edges` | Which node follows which, by the outcome a visit reports |
| `args` | The arguments a start gives. Each becomes an item of the run's [bag](/floor/concepts/bag/) |
| `start` | The [events](/floor/concepts/events/) that start a run, and how their payload fills the arguments |

An edge's `on` is the outcome that takes it, or `always`. A line that loops must say how often, with `iteration_max` on the edge.

```yaml
line:
  id: write-note
  entry: write
  exit: done
  start:
    on: [note.requested]
    args:
      topic: "{topic}"
  args:
    topic: { kind: value, subject: true }
  nodes:
    - id: write
      station: write-note
    - id: done
  edges:
    - from: write
      to: done
      on: success
```

The line needs a `write-note` station to be complete. Every field is in [Pipeline file](/floor/specs/pipeline-file/#2-the-line), and the checks floor makes when you put a line are in [Rules of a line](/floor/specs/pipeline-file/#3-rules-of-a-line).

## Versions

A line is never edited in place. Each change makes a new **version**, named by a hash of its content. Putting the same content again changes nothing.

A run keeps the version it started with. A newer version changes later runs only, and a node can pin one version of its station as `name@hash`.

## Where lines live

You write a line in a pipeline file, or as one folder of a [collection](/floor/concepts/collection/). One line has many [assembly runs](/floor/concepts/assembly-run/).
