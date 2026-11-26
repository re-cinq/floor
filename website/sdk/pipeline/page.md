---
title: Pipeline SDK
description: Read, import, and export Floor pipeline definitions from YAML.
---

{{intro}}

Install {{package}} with `npm install @re-cinq/floor-pipeline`. For a first CLI workflow, follow [Import and export a pipeline](/floor/tutorials/pipeline-round-trip/).

## Read a pipeline file

Use this function to inspect a file before importing it. `readPipelineFile` checks the YAML document’s outer structure. Floor validates the definitions when you import them. See the [pipeline file specification](/floor/specs/pipeline-file/).

{{read.mts}}

## Import from TypeScript

Save the first example as `read.mts` beside this file. Pass a [Floor connection](/floor/sdk/pipeline/#floor) and the path to your YAML file. Inspect the returned [Put results](/floor/sdk/pipeline/#put) to see which station and line changed.

{{import.mts}}

Both examples run against the published package. [View example tests]({{test}}). For TypeScript projects, we recommend adding [Floor’s ESLint rules](https://www.npmjs.com/package/@re-cinq/eslint-plugin-re-lint) as a development dependency.

## Schema entry points

Import `agentConfigSchema` from `@re-cinq/floor-pipeline/agent-config` to check an [agent configuration](/floor/specs/agent-file/). The `@re-cinq/floor-pipeline/definition-schemas` entry point exports `definitionSchemas`, `ScheduleChecks`, and `itemKind`. The factory accepts a Zod object constructor and optional cron and timezone validators, and returns schemas for line, station, agent definition, and schedule bodies. See the [pipeline field tables](/floor/specs/pipeline-file/) for the YAML representation.

## API reference
