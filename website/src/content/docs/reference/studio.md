---
title: The floor-studio command
description: A local page that draws a collection's assembly lines, runs one agent station on your machine, and tests a whole line locally.
wordBudget: 380
sidebar:
  order: 4
---

`floor-studio` opens a page for a collection folder. It draws every assembly line, explains each station (its events, needs and prompt placeholders), lets you edit prompts and agent settings, and runs one agent station with your own `claude` or `codex`. No floor or cluster is involved.

A line folder may sit in a [group folder](/floor/specs/collection/#1-layout). The page follows `groups` in `floor-collection.yaml`, draws the lines the collection reads and lists every refused file with its reason.

## How do I open my collection in Studio?

From the collection folder, run:

```sh
npx @re-cinq/floor-studio .
```

The dot means the current directory. From another directory, replace it with the path to your collection folder. Choose the folder containing your assembly lines.

Studio opens your collection in the browser. If the browser stays closed, open the full URL printed in the terminal. Keep the command running while you use Studio, then press Ctrl+C to stop it.

## Options

| option | meaning |
|---|---|
| `dir` | the collection. Default: the current directory |
| `--port <n>` | the backend's socket port on `127.0.0.1`. Default: a free one |
| `--host-key <name>` | a frontmatter key the host owns. Repeatable. The collection's `floor-collection.yaml` can name them instead |
| `--no-open` | print the url only. Otherwise the browser opens after 3 seconds, unless a page has already connected |

Exit codes: 0 on `--help`, 1 for a directory that does not exist, 2 for a bad argument.

## Running a station

The Run tab takes a value for each need, a working folder and a permission (`acceptEdits`, or `bypass` as in the pod). Preview shows the exact prompt and command and what blocks the run. A run's transcript streams live, survives a page reload, and ends with the outcome, the produces found and the edge lit on the graph.

Runs and typed needs are kept in `.floor-studio/` in the collection, which ignores itself in git.

## Testing a whole line

Test locally, on a line's header, runs the line as saved on disk. The start screen asks for each start input and a workspace folder. Browse opens your home folder; type to filter, Tab completes. Start copies the definitions into `<workspace>/<line>-<UTC time>/` and runs agent stations with your `claude`, while the floor's own routing picks each next step.

A station Studio cannot run waits under Waiting for you: a button per outcome, a form when the next node reads what the station produces (a file is pasted or picked on disk), and a button per event the node answers. The run screen lists each visit with its outcome and cost, and opens the run folder or a visit's folder, which keeps its inputs, prompt, transcript and outputs. Cancel stops the run.
