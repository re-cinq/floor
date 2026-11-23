---
title: On run settled
description: Start a run when another run of any line ends in a given outcome.
wordBudget: 150
sidebar:
  order: 5
---

Use this when a failed run needs follow-up, such as an alert.

<!-- generated:example:cookbook/on-run-settled/pipeline.yaml -->

````yaml title="on-run-settled/pipeline.yaml"
# yaml-language-server: $schema=https://re-cinq.github.io/floor/schemas/pipeline.schema.json
line:
  id: on-run-settled
  entry: alert
  exit: done
  fail: stopped
  start:
    on:
      - internal.run.settled
    when:
      outcome: failed
    args:
      run_id: "{runId}"
      line_id: "{lineId}"
  args:
    run_id:
      kind: value
      subject: true
    line_id:
      kind: value
  nodes:
    - id: alert
      station: send-alert
    - id: done
    - id: stopped
  edges:
    - from: alert
      to: done
      on: success
    - from: alert
      to: stopped
      on: failed
stations:
  send-alert:
    description: A worker of yours tells the team which run of which line failed.
    kind: service
    outcomes:
      - success
      - failed
    needs:
      - name: run_id
        kind: value
      - name: line_id
        kind: value
    produces: []
````

<!-- /generated -->

## How it works

1. The floor sends `internal.run.settled` whenever a run ends.
2. `start.on` lists that event and `start.when` keeps only `outcome: failed`.
3. `start.args` fills `run_id` and `line_id` from the payload fields `runId` and `lineId`.
4. A line never starts on this event for its own runs, so a failed alert does not start another alert.

See [How a run ends](/floor/specs/run-semantics/#5-how-a-run-ends) and [Start](/floor/specs/pipeline-file/#22-start).
