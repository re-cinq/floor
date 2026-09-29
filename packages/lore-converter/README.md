# @floor/lore-converter

Reads a lore assembly line and the recipes its nodes name, and writes what this floor runs in its place: a line, its stations, its agent definitions. It reads a lore checkout and changes nothing in it.

```
node packages/lore-converter/dist/cli.js --lore ~/workspace/lore --line code-review
node packages/lore-converter/dist/cli.js --lore ~/workspace/lore --all
node packages/lore-converter/dist/cli.js --lore ~/workspace/lore --line code-review --put http://localhost:8180
```

`--all` is a report: for each line, what it became and what is left for a person to decide.

## Where this fits

A tool a person runs, not a process that stays up. It reads a lore checkout from disk and writes
what this floor would run in its place; with `--put` it posts the result to a floor over HTTP like
any other client. It links [`@floor/store`](../store/README.md) only for its types and
`validateLine`, so it can say up front what a floor would refuse.

It is how lore's existing assembly lines get here at all. See [the map](../../README.md).

## What becomes what

| in lore | here |
|---|---|
| an `agent` node's `prompt_ref` and `model` | an agent definition, one per distinct pair; the prompt is kept as written |
| the recipe's front matter | the definition's settings: `timeout_minutes`, `model`, and in `config` its `disallowed_tools` and `test_policy` |
| an `agent` node | an agent station. It needs the repo at `target`, where lore's prompts look, and a value for each `{name}` the prompt asks for |
| what the agent prints | a file the station produces, `<node>_output`, `from: output`. Lore's prompts answer in their output |
| `repo_workdir: false` | the repo is cloned with `access: read` |
| `continues: { key: args.x }` | `conversation: continue`, `conversationKey: x` |
| `by_hand: true` | the node's start event is `manual.<line>.<node>` |
| the terminal `retrospective` | a node with no station |
| a review node a person works | a human station; its `route`'s `{args.x}` is `{x}` |
| any other node | a service station, named after its job |
| `iteration_max` | `iterationMax` |

## What is not in lore's files

A line's file does not say what starts it, what it is given, or what lore's floor did in code around it. `known-lines.ts` holds that, one line at a time, each read by hand from lore's code. A line with no entry there still converts, with the default arguments and no start event, and says so in its notes.

Today it holds `code-review` and `code-review-recheck`. The first starts when a pull request opens, the second never by itself: a push goes to a review router station, which asks for one or the other. Both have a `post-review` station where lore's floor posted the review from a hook.

A service station converts with no needs and no produces. What a lore job read and wrote is in its code. Each is noted.

## Checked

Every converted line is run through the floor's own `validateLine`, against the stations it comes with. What the floor would refuse is a note.
