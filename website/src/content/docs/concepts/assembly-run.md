---
title: Assembly run
description: One execution of an assembly line, made of visits, with its state derived from them.
wordBudget: 400
sidebar:
  order: 2
---

An **assembly run** is one execution of one version of an [assembly line](/floor/concepts/assembly-line/). Walking it opens a visit at each node it reaches.

## Visits

A visit is one execution of one node. A node visited three times has three visits.

| Part | Meaning |
| --- | --- |
| Brief | What goes in. Each need is filled from the [bag](/floor/concepts/bag/) when the visit opens and stays as it was filled |
| Report | What comes out. An outcome, the items produced and an optional error |
| Worker | Who claimed the visit. An agent pod, a service or a person |
| Deadline | When the visit has `failed` if no report has come |

See [A visit](/floor/specs/run-semantics/#3-a-visit) for who does the work and the deadlines.

## The subject

One argument of the line is marked `subject: true`. Its value gives the run its subject key, such as `pr_url:https://github.com/acme/shop/pull/7`.

One open run exists for a repository and a subject key. A start that would make a second one joins the open run and starts nothing. See [The subject](/floor/specs/run-semantics/#11-the-subject).

## How a run ends

| Outcome | When |
| --- | --- |
| `success` | The run reaches the `exit` node |
| `failed` | The run reaches the `fail` node |
| `iteration_max` | An edge needs one more pass than its `iteration_max` allows |
| `error` | A visit has no edge for its outcome, or the run makes 200 visits |

Floor then sends `internal.run.settled`. The reasons are in [How a run ends](/floor/specs/run-semantics/#5-how-a-run-ends).

## Derived state

Floor stores visits and nothing else about progress. You read the rest from them.

| State | Derived from |
| --- | --- |
| Status | Whether the run has an outcome |
| Bag | The start arguments, then each reported visit's produced items, later ones winning |
| Current node | The last visit and its report |
| Cost | The sum of the model calls of its visits |
