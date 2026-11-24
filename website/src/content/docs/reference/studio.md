---
title: The floor-studio command
description: A local page that draws a collection's assembly lines and runs one agent station on your machine.
wordBudget: 250
sidebar:
  order: 4
---

`floor-studio` opens a page for a collection folder. It draws every assembly line, explains each station (its events, needs and prompt placeholders), lets you edit prompts and agent settings, and runs one agent station with your own `claude` or `codex`. No floor or cluster is involved.

It is not on npm yet. Run it from a floor checkout:

```
npm install && npm run build
node packages/studio/dist/cli.js path/to/collection
```

## Options

| option | meaning |
|---|---|
| `dir` | the collection. Default: the current directory |
| `--port <n>` | the backend's socket port on `127.0.0.1`. Default: a free one |
| `--host-key <name>` | a frontmatter key the host owns. Repeatable |
| `--no-open` | print the url only. Otherwise the browser opens after 3 seconds, unless a page has already connected |

Exit codes: 0 on `--help`, 1 for a directory that does not exist, 2 for a bad argument.

## Running a station

The Run tab takes a value for each need, a working folder and a permission (`acceptEdits`, or `bypass` as in the pod). Preview shows the exact prompt and command and what blocks the run. A run's transcript streams live, survives a page reload, and ends with the outcome, the produces found and the edge lit on the graph.

Runs and typed needs are kept in `.floor-studio/` in the collection, which ignores itself in git.
