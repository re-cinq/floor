---
title: Scheduled
description: Start an assembly run on a cron schedule.
wordBudget: 150
sidebar:
  order: 4
---

Use this when work repeats at fixed times, such as a digest on weekday mornings.

<!-- generated:example:cookbook/scheduled/assembly-line.yaml -->

````yaml title="scheduled/assembly-line.yaml"
# yaml-language-server: $schema=https://re-cinq.github.io/floor/schemas/pipeline.schema.json
line:
  id: scheduled
  entry: build
  exit: done
  fail: stopped
  start:
    on:
      - schedule.morning-digest.tick
    args:
      day: "{scheduledFor}"
  args:
    day:
      kind: value
      subject: true
  nodes:
    - id: build
      station: build-digest
    - id: done
    - id: stopped
  edges:
    - from: build
      to: done
      on: success
    - from: build
      to: stopped
      on: failed
stations:
  build-digest:
    description: A worker of yours builds the digest for the day.
    kind: service
    outcomes:
      - success
      - failed
    needs:
      - name: day
        kind: value
    produces:
      - name: digest
        kind: value
schedules:
  morning-digest:
    cron: "0 7 * * 1-5"
    timezone: Europe/Amsterdam
    payload: {}
````

<!-- /generated -->

## How it works

1. The `morning-digest` entry under `schedules` ticks on its `cron`, read in its `timezone`.
2. Each tick sends the event `schedule.morning-digest.tick`. Its payload is `payload` plus `scheduledFor`.
3. The line lists that event in `start.on`.
4. The template `{scheduledFor}` fills the argument `day`, which is the run's subject. A tick that repeats joins the open run.

See [Schedules](/floor/specs/pipeline-file/#7-schedules) and [Start templates](/floor/specs/placeholders/#1-start-templates).
