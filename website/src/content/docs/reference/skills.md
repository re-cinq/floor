---
title: The floor skills
description: The Claude Code plugin that writes and checks a collection's assembly lines and agent prompts, and how to install it.
wordBudget: 250
sidebar:
  order: 5
---

The `floor` plugin gives [Claude Code](https://code.claude.com/docs) three skills for a [collection](/floor/specs/collection/). They edit the collection's files, run `floor-pipeline lint` after every change, and apply to a floor only when you ask.

## Install

```bash
claude plugin marketplace add re-cinq/floor --sparse .claude-plugin plugins/floor
claude plugin install floor@floor
```

`--sparse` fetches the two folders the plugin needs, not the whole repository. A push to floor's `main` is a new version. Get it with `claude plugin update floor@floor`.

## The skills

| Skill | What it does |
| --- | --- |
| `/floor:assembly-line` | Creates or edits a line's [`assembly-line.yaml`](/floor/specs/pipeline-file/): stations, nodes, edges, outcomes, arguments |
| `/floor:prompt` | Creates or edits an [agent file](/floor/specs/agent-file/) or an extension: settings, prompt, placeholders, result line |
| `/floor:collection` | Starts a collection, lints it and explains each refusal, applies it, exports and archives lines |

Claude picks a skill from what you ask, so "add a review station to write-note" is enough.

Each skill reads these pages before it writes, so it needs the network. The site describes floor's `main`. When your `floor-pipeline` is older and disagrees with a page, the skill follows what lint says.

## For a team

Commit this to the collection's `.claude/settings.json`. Each person accepts the workspace trust prompt and runs the install command once.

```json
{
  "extraKnownMarketplaces": {
    "floor": { "source": { "source": "github", "repo": "re-cinq/floor" }, "autoUpdate": true }
  },
  "enabledPlugins": { "floor@floor": true }
}
```
