---
title: Placeholders
description: The three kinds of placeholder in a collection, where each is allowed and what fills it.
sidebar:
  order: 4
---

A collection has three kinds of placeholder. They look alike and are filled at different times from different things.

| Kind | Written as | Where | Filled | From |
| --- | --- | --- | --- | --- |
| [Start template](#1-start-templates) | `{name}` | `line.start.args` | When an event starts a run | The event's payload |
| [Prompt placeholder](#2-prompt-placeholders) | `{name}` | The body of an agent file | When a visit opens | The visit's needs |
| [Environment variable](#3-environment-variables) | `${NAME}` | `pipeline.yaml` and agent frontmatter | When the collection is applied | The environment |

None of them has conditions, loops or defaults.

## 1. Start templates

A value of `line.start.args` is a template. It turns an event's payload into one argument of the run.

```yaml
start:
  on: [pull_request.opened]
  args:
    pr_url: "https://{host}/{repo}/pull/{number}"
```

1. A name is a letter or `_`, then letters, digits and `_`.
2. A name MUST be a top-level field of the payload. A field inside an object cannot be reached, so the sender flattens its payload first.
3. The field MUST be text, a number or a boolean.
4. The filled value MUST be 4096 bytes or less.

When a rule fails, the run does not start and the event keeps the reason.

| Failure | The floor says |
| --- | --- |
| The payload has no such field | `a template names {x}, which is not there to fill it` |
| The field is an object, a list or null | `{x} is not text, a number or a boolean` |
| The value is too long | `a rendered value is over 4096 bytes` |

## 2. Prompt placeholders

`{name}` in an agent's prompt is filled when a visit opens at a node that runs the agent.

| Placeholder | Filled with |
| --- | --- |
| `{<need>}` | The text of a `value` need of that name |
| `{<need>_path}` | Where a `file` or `git` need is in the pod, such as `/workspace/issue.md` |
| `{<produce>_path}` | Where the agent writes a produce that has a `path` |
| `{run_id}`, `{line_id}`, `{node_id}` | The run, its line and the node of this visit |
| `{previous_error}` | The error of the last failed visit at this node, 2500 characters at most |
| `{previous_failures}` | The errors of up to three failed visits at this node, newest first, with a line of `---` between them |
| `{item}` | In the body of a fan-out, the entry of the list this branch runs for |

1. A name is letters, digits, `_`, `.` and `-`.
2. A placeholder with nothing to fill it is left in the prompt as written. `{previous_error}` stays as that text on a first visit, so write the prompt to read well either way.
3. Nothing is escaped. A value is put in as it is.
4. A `value` need wins over a path of the same name.
5. A need is named by the station, not by the bag. With `bind: { target: repo }`, the prompt says `{target_path}`.
6. `git_credential` and `git_credential_url` are the floor's own. Do not use them as names.

`floor-pipeline lint` refuses a prompt that names something the line cannot fill, under the rule `unsupplied-input`. It accepts a name that is an argument of the line, a need or a produce of the station, one of those with `_path` added, or a name from the table above. Lint reads names made of lowercase letters, digits, `_` and `.`.

### Example

The station:

```yaml
needs:
  - { name: topic, kind: value }
  - { name: target, kind: git, path: repo }
produces:
  - { name: note, kind: file, path: out/note.md }
```

The prompt:

```text
Read the code in {target_path}. Write one sentence about {topic} into {note_path}.
```

What the agent is told, for a run started with the topic `retries`:

```text
Read the code in /workspace/repo. Write one sentence about retries into /workspace/out/note.md.
```

## 3. Environment variables

`${NAME}` keeps a value that differs between installs, such as an image or a URL, out of the collection.

```yaml
image: ${AGENT_IMAGE}
```

1. A name is an uppercase letter, then uppercase letters, digits and `_`.
2. It is filled anywhere in `pipeline.yaml`, comments included, and in every text value of an agent file's frontmatter.
3. It is never filled in a prompt. `${HOME}` in a prompt reaches the agent as written.
4. A variable that is not set refuses the file with `NAME is not set, and a pipeline names it`.
5. `floor-pipeline lint` does not need the variables. It checks the collection as if each were set.
