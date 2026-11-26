---
title: Station SDK
description: Build a worker that handles visits and reports results to Floor.
---

{{intro}}

## Write your first station

Follow [Build a Hello World station](/floor/tutorials/hello-world-station/) for the matching pipeline and commands to see the greeting. Install {{package}} and set `FLOOR_API_URL` and `FLOOR_SERVICE_TOKEN` in the worker’s environment.

{{worker.mts}}

The handler takes `needs` from the [visit brief](/floor/sdk/station/#brief). The worker keeps polling. When the `hello` station receives `name: "Ada"`, it returns `greeting: "Hello, Ada!"` with outcome `success`. [View example test]({{test}})

For TypeScript stations, we recommend adding `@re-cinq/eslint-plugin-re-lint` as a development dependency. See the [tutorial setup](/floor/tutorials/hello-world-station/#install-the-sdk-and-cli).

## Read and produce a file

For a station with a file input named `note` and a file output named `copy`, read the input bytes and pass them to `produce`. The SDK records the stored file in the visit report.

Floor calls the [handler](/floor/sdk/station/#handle) with two arguments. [Brief](/floor/sdk/station/#brief) describes the current visit and its named inputs. [Tools](/floor/sdk/station/#tools) lets the handler read the input file and store its output.

{{file-worker.mts}}

[View example test]({{test}})

## Poll one batch

Pass `start: false` when another process controls polling. Calling `once()` processes one batch and returns the number of events claimed.

{{poll.mts}}

[View example test]({{test}})

If a handler throws, the SDK reports a failed visit. If it cannot post the report, it returns the dispatch to the queue for retry. Account for repeated visits when a handler creates an external resource.

For the report posted to Floor, see the [wire report type](/floor/sdk/contracts/#report).

## API reference

Generated from the declarations published in {{package}}.
