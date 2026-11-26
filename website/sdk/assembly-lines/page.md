---
title: Assembly Lines SDK
description: Validate a line against its station catalogue and replay a run’s routing decisions.
---

{{intro}}

Install {{package}} with `npm install @re-cinq/floor-assembly-lines`. The examples run locally with Node.js. Follow [Validate and replay a Hello World line](/floor/tutorials/replay-hello-world/) to run them together.

## Check a definition

[validateLine](/floor/sdk/assembly-lines/#validateline) takes a [line body](/floor/sdk/contracts/#linebody) and a [catalogue](/floor/sdk/assembly-lines/#knowndefinitions). Supply the known station names to check references. Include their bodies to check declared outcomes and needs. An empty list means the checks found no problems.

{{hello.mts}}

## Predict the next transition

[getNextTransition](/floor/sdk/assembly-lines/#getnexttransition) takes a walk graph and the visit history so far. It returns a decision that a caller can inspect. The [run semantics specification](/floor/specs/run-semantics/) explains terminal nodes, retries, and fan-out.

{{replay.mts}}

For prompt parsing in a browser, the package also exposes the `@re-cinq/floor-assembly-lines/placeholder-pattern` entry point. For TypeScript projects we recommend [Floor’s ESLint rules](https://www.npmjs.com/package/@re-cinq/eslint-plugin-re-lint) as a development dependency. [View example tests]({{test}}).

## API reference
