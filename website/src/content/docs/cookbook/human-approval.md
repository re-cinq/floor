---
title: Human approval
description: Hold a run at a station until a person answers with an event.
wordBudget: 150
sidebar:
  order: 2
---

Use this when a step needs a person to approve or reject before the run goes on.

<!-- generated:example:cookbook/human-approval/pipeline.yaml -->

````yaml title="human-approval/pipeline.yaml"
# yaml-language-server: $schema=https://re-cinq.github.io/floor/schemas/pipeline.schema.json
line:
  id: human-approval
  entry: approve
  exit: done
  fail: declined
  start:
    on:
      - release.requested
    args:
      release: "{release}"
  args:
    release:
      kind: value
      subject: true
  nodes:
    - id: approve
      station: approve-release
      reports:
        - on: release.answered
          when:
            decision: approved
          outcome: approved
        - on: release.answered
          when:
            decision: rejected
          outcome: rejected
    - id: done
    - id: declined
  edges:
    - from: approve
      to: done
      on: approved
    - from: approve
      to: declined
      on: rejected
stations:
  approve-release:
    description: A person approves or rejects the release.
    kind: human
    outcomes:
      - approved
      - rejected
    needs:
      - name: release
        kind: value
    produces: []
````

<!-- /generated -->

## How it works

1. The `approve-release` station has kind `human`, so its visit waits with no deadline.
2. The node's `reports` list the events that answer it. Each entry has an `on`, a `when` and the `outcome` it reports.
3. The edges `approved` and `rejected` take the run to `done` or to `declined`.
4. To answer, post an event that names the run by `subjectKey`:

```json
{
  "name": "release.answered",
  "payload": { "subjectKey": "release:v1.4", "decision": "approved" }
}
```

See [Nodes](/floor/specs/pipeline-file/#23-nodes) and [Events for a running run](/floor/specs/run-semantics/#2-events-for-a-running-run).
