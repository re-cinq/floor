---
title: Start and watch your first run in TypeScript
description: Start the Hello World assembly line from a Node.js service and read its greeting.
---

Use Node.js 22.18 or newer. Complete [Build a Hello World station](/floor/tutorials/hello-world-station/) first and leave its worker running. Open another terminal in that project and install the client with `npm install @re-cinq/floor-client`. Export the same `FLOOR_API_URL` and `FLOOR_SERVICE_TOKEN` you used for the worker.

## Start the run

Save this as `start.mts`. The line expects a value called `name`. Floor returns the ID of the run it started or joined.

{{start.mts}}

## Follow it to settlement

Save this as `watch-run.mts`. This watch starts at the beginning of the run, so it can see the settlement even when the worker finishes before the client connects.

{{watch-run.mts}}

## Read the result

Save this as `hello.mts` beside the other two files and run `node hello.mts`.

{{hello.mts}}

The expected output is `Hello, Ada!`. See the [Client SDK reference](/floor/sdk/client/) for service-wide watches and visit-scoped operations.
