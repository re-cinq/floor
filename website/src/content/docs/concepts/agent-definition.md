---
title: Agent definition
description: The model, prompt, image and limits that an agent station runs.
wordBudget: 300
sidebar:
  order: 4
---

An **agent definition** is what an `agent` [station](/floor/concepts/station/) runs. A station names it by id in `agent_definition`, and many stations can name the same one.

## What it holds

| Setting | Meaning |
| --- | --- |
| `model` | The model the agent runs on |
| `prompt` | What the agent is told, with `{name}` filled when a visit opens |
| `image` | The container image of the pod |
| `timeout_minutes` | How long a visit may run |
| `tags` | A cluster agent claims a visit only when it offers every tag |
| `config` | Settings for the pod, such as skills, MCP servers and `max_turns` |
| `prices` | Cost per million tokens, for a model that reports tokens and no cost |

Floor holds no prices of its own. A model that reports its cost needs none, and any other needs an entry in `prices`.

The fields are in [Frontmatter](/floor/specs/agent-file/#2-frontmatter). The placeholders are in [Placeholders](/floor/specs/placeholders/#2-prompt-placeholders).

## Variants per repository

A definition can have a variant for one repository. When a run has that repository, the variant is laid over the settings by field, by key of `config` and by model of `prices`. You set variants on the floor with `PUT /agent-definitions/{id}`.

## In a collection

In a [collection](/floor/concepts/collection/), an agent is one markdown file. The frontmatter holds the settings and the body is the prompt.

```markdown
---
model: claude-sonnet-5-5
image: ${AGENT_IMAGE}
timeout_minutes: 10
---
Write one short sentence about {topic} into the file {note_path}.

LORE_NODE_RESULT: success
```

The file name is the agent's id. See [Agent file](/floor/specs/agent-file/).
