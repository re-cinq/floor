---
title: Collection
description: A folder of assembly lines and their agents, kept in git and checked by lint.
wordBudget: 250
sidebar:
  order: 7
---

A **collection** is a folder that holds [assembly lines](/floor/concepts/assembly-line/) and the [agent definitions](/floor/concepts/agent-definition/) they use. It is usually a git repository.

```text
my-collection/
  write-note/
    pipeline.yaml
    agents/
      note-writer.md
```

Each line has a folder named by its `line.id`. The folder holds the line's pipeline file and one markdown file for each agent. The full layout is in [Collection](/floor/specs/collection/#1-layout).

## When to make one

Make a collection when you want lines and agents reviewed and versioned as files. A collection is stricter than a pipeline file on its own. It needs exactly one subject argument and no `agent_definitions` block.

## Check and apply

Lint checks every file with no floor and no environment variables.

```sh
npx @re-cinq/floor-pipeline lint .
```

Apply puts every agent, then each line, onto a floor. Applying the same collection twice changes nothing.

```sh
FLOOR_SERVICE_TOKEN=... npx @re-cinq/floor-pipeline apply . --floor http://localhost:8180
```

Lint does not run every check floor runs. See [Limits](/floor/specs/collection/#7-limits) and the [rules lint checks](/floor/specs/collection/#2-rules).
