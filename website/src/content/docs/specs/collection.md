---
title: Collection
description: The folder layout that holds assembly lines and their agents, and the rules its lint checks.
sidebar:
  order: 3
---

A collection is a folder of assembly lines. Each line has a folder with its [pipeline file](/floor/specs/pipeline-file/) and its [agent files](/floor/specs/agent-file/). A collection is usually a git repository.

The words MUST, MUST NOT, SHOULD and MAY are used as in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## 1. Layout

```text
my-collection/
  README.md                 ignored
  docs/                     ignored
  write-note/               a line folder
    assembly-line.yaml
    agents/
      note-writer.md
  review-note/
    assembly-line.yaml
    agents/
      note-reviewer.md
```

A line folder MAY sit one level down, in a group folder. A group folder holds line folders and nothing else that is read.

```text
my-collection/
  stock/                    a group folder
    write-note/             a line folder, and the line is write-note
      assembly-line.yaml
      agents/
        note-writer.md
  ours/
    review-note/
      assembly-line.yaml
```

| Path | What it is |
| --- | --- |
| `<line>/assembly-line.yaml` | The line's pipeline file |
| `<line>/agents/<agent>.md` | An agent file |
| `<line>/agents/<agent>.extra.md` | An extension of an agent the host ships |
| `<group>/<line>/assembly-line.yaml`, `<group>/<line>/agents/<agent>.md`, `<group>/<line>/agents/<agent>.extra.md` | The same three files, for a line folder in a group folder |
| `floor-collection.yaml` at the top level | The collection's settings: `host_keys`, the frontmatter keys its host owns |
| Any other file at the top level, anything under `docs/`, `skills/` or `agent-skills/` (the host's skills), anything under a folder whose name starts with `.` | Ignored |
| Any other `.md`, `.yml` or `.yaml` file in a line folder or a group folder | Refused |
| Any other file in a line folder or a group folder | Ignored |

1. `line.id` in `assembly-line.yaml` MUST equal the name of its own folder, the last one. A group folder is in no name. If not, the file is refused with `the folder F must hold the pipeline of that name, and its line is X`.
2. A refused path says `a collection does not read this path: a line folder holds assembly-line.yaml, agents/<agent>.md and agents/<agent>.extra.md`. A file named `assembly-line.yml` is refused this way.
3. An agent's id is its file name. It MUST be unique in the whole collection, not only in its folder. A second file for the same agent is refused with `<agent> is already set by <path>`.
4. A station MAY name an agent that another line's folder defines.
5. A collection has no manifest and no version file.
6. A group folder MUST NOT sit in another group folder. A line file two folders down is refused as in rule 2.
7. The name of a line folder or a group folder MUST NOT start with `.`, and MUST NOT be `skills` or `agent-skills`. A group folder MUST NOT be named `docs`. A line folder in a group MUST NOT be named `agents`. Such a path is ignored or refused as in rule 2.
8. A folder that holds a line file is a line folder, not a group. A line file below it is refused with `the folder G holds a line, so it is not a group: move L out of it`.
9. A line's id MUST be unique in the whole collection. Of two line folders with the same name, the first by path owns the name and the second is refused with `<line> is already set by <path>`. The first owns the name whether or not its file can be read, so a broken file never lets another folder's copy through. Path order is the only order: `ours/triage/` comes before a top-level `triage/`, and wins over it.
10. Lines are read, and applied, in the order of their names, then of their paths. Moving a line folder into a group folder does not change that order.

## 2. Rules

A collection is stricter than a pipeline file on its own. `floor-pipeline lint` checks each `assembly-line.yaml` against these rules and refuses the file when one fails.

| Rule id | Rule |
| --- | --- |
| `agent-settings-in-pipeline` | The file MUST NOT have an `agent_definitions` block. An agent is defined in its own file. |
| `undeclared-agent` | A station's `agent_definition` MUST be an agent the collection defines or the host ships. |
| `undeclared-bag` | A station MUST have both `needs` and `produces`. Either MAY be an empty list. |
| `unkeyed-line` | Exactly one argument MUST set `subject: true`. |
| `unseeded-need` | A required need MUST be an argument, a line file, or something a station in the file produces. A `git` need MUST be a `git` argument. |
| `unsupplied-input` | Every `{name}` in an agent's prompt MUST be a need or a produce of the station, or a name the floor fills. See [Placeholders](/floor/specs/placeholders/#2-prompt-placeholders). |
| `outcome-without-edge` | Every outcome a station lists MUST have an edge from the node, or the node an `always` edge. |
| `undeclared-outcome` | An edge's `on` MUST be an outcome the node's station lists, or `always`. |
| `ambiguous-edge` | Two edges MUST NOT leave one node on the same `on`. |
| `dangling-edge` | Both ends of an edge MUST name a node. |
| `dead-end` | A node other than the exit and the fail node MUST have an outgoing edge. |
| `unreachable` | Every node MUST be reachable from the entry, or from a node that sets `start`. |
| `unbounded-retry` | An edge from a node to itself MUST set `iteration_max`. |
| `unresolvable-conversation-key` | A station's `conversation_key` MUST be a declared argument. |

## 3. Environment variables

`${NAME}` in `assembly-line.yaml` and in an agent file's frontmatter is filled when the collection is applied. See [Placeholders](/floor/specs/placeholders/#3-environment-variables).

## 4. Checking a collection

```sh
npx @re-cinq/floor-pipeline lint .
```

A clean collection prints one line and the exit code is 0.

```text
collection ok: 1 agents, 1 pipelines, 0 extensions
```

A refused file prints `<path>: <reason>` and the exit code is 1.

```text
write-note/assembly-line.yaml: no arg carries subject: true, so the floor cannot refuse a second run for the same subject
```

Lint needs no floor and no environment variables.

## 5. Applying a collection

```sh
FLOOR_SERVICE_TOKEN=... npx @re-cinq/floor-pipeline apply . --floor http://localhost:8180
```

1. Every agent is put first, then each line with its stations, in the order of the line folders' names.
2. When a file is refused, nothing is put.
3. Applying the same collection twice changes nothing. A changed file makes a new version of what it defines.
4. Applying sets an agent's settings. Repository variants the floor holds for that agent are kept.
5. Removing a file from a collection removes nothing from the floor. Use the `archive` key of a pipeline file.

A host can load a collection its own way. Lore reads one from a git repository on each push and adds agents and lines of its own.

## 6. Example

The starter collection is in [`examples/starter`](https://github.com/re-cinq/floor/tree/main/examples/starter).

<!-- generated:example:starter/write-note/assembly-line.yaml -->

````yaml title="write-note/assembly-line.yaml"
# yaml-language-server: $schema=https://re-cinq.github.io/floor/schemas/pipeline.schema.json
line:
  id: write-note
  entry: write
  exit: done
  fail: stopped
  start:
    on:
      - note.requested
    args:
      topic: "{topic}"
  args:
    topic:
      kind: value
      subject: true
  nodes:
    - id: write
      station: write-note
    - id: publish
      station: publish-note
    - id: done
    - id: stopped
  edges:
    - from: write
      to: publish
      on: success
    - from: write
      to: write
      on: failed
      iteration_max: 1
    - from: publish
      to: done
      on: success
    - from: publish
      to: stopped
      on: failed
stations:
  write-note:
    description: An agent writes one sentence about the topic into a file.
    kind: agent
    agent_definition: note-writer
    outcomes:
      - success
      - failed
    result_required: true
    needs:
      - name: topic
        kind: value
    produces:
      - name: note
        kind: file
        path: note.md
  publish-note:
    description: A worker of yours reads the note and publishes it.
    kind: service
    outcomes:
      - success
      - failed
    needs:
      - name: note
        kind: file
    produces:
      - name: note_url
        kind: value
````

<!-- /generated -->

<!-- generated:example:starter/write-note/agents/note-writer.md -->

````markdown title="write-note/agents/note-writer.md"
---
model: claude-sonnet-5-5
image: ${AGENT_IMAGE}
timeout_minutes: 10
config:
  max_turns: 10
---
Write one short sentence about {topic} into the file {note_path}. Do nothing else.

When the file is written, end your reply with this line on its own:

LORE_NODE_RESULT: success
````

<!-- /generated -->

## 7. Limits

- Lint does not run every check the floor runs. It does not check an agent's `config`, a fan-out, or that a need is produced on every path into a node. A collection that passes lint can be refused on apply.
- `apply` puts one definition at a time. When the floor refuses one, the definitions before it stay put.
