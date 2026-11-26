---
title: Validate and replay a Hello World line
description: Predict the next action for an empty, open, successful, or failed visit history.
---

Use Node.js 22.18 or newer. You’ll check the same three nodes as the [Hello World pipeline](/floor/tutorials/hello-world-station/#define-the-pipeline) and predict where a greeting goes. You can leave Floor and the worker stopped.

## Define the line

In a new directory, run `npm init -y`, then `npm install @re-cinq/floor-assembly-lines @re-cinq/floor-contracts`. Save this as `hello.mts`. The service station is named `hello`; its node in the line is named `greet`. Visits use the node ID.

{{hello.mts}}

## Replay the visit

Save this as `replay.mts` in the same directory, then run `node replay.mts`.

{{replay.mts}}

Expected output:

```text
Validation problems: []
Before any visit: launch
While greet is open: await
After success: finish
After failure: halt
```

An empty history launches the entry node. An open visit waits. The `success` edge leads to the exit node `done`; the `failed` edge leads to the failure node `broken`. To see those routes drawn, open the [interactive Hello World graph](/floor/sdk/graph/#explore-the-hello-world-line).
