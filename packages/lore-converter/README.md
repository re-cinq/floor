# @floor/lore-converter

Reads a lore assembly line and the recipes its nodes name, and writes what this floor runs in its place: an assembly line, its stations and its agent definitions. It reads a lore checkout and changes nothing in it.

```
node packages/lore-converter/dist/cli.js --lore ~/workspace/lore --line code-review
node packages/lore-converter/dist/cli.js --lore ~/workspace/lore --all
node packages/lore-converter/dist/cli.js --lore ~/workspace/lore --line code-review --put http://localhost:8180
```

`--all` is a report: for each assembly line, what it became and what is left for a person to decide.

## Where this fits

This is a tool a person runs, and it does not stay up. It reads a lore checkout from disk. With `--put` it posts the result to a floor over HTTP like any other client. It links [`@floor/store`](../store/README.md) only for its types and `validateLine`, so it can say up front what a floor would refuse.

It is how lore's existing assembly lines get here. See [the map](../../README.md).

## What becomes what

| in lore | here |
|---|---|
| an `agent` node's `prompt_ref` and `model` | An agent definition, one per distinct pair. The prompt is kept as written |
| the recipe's front matter | The definition's settings: `timeout_minutes`, `model`, and in `config` its `disallowed_tools` and `test_policy` |
| an `agent` node | An agent station. It needs the repo at `target`, where lore's prompts look, and a value for each `{name}` the prompt asks for |
| what the agent prints | A file the station produces, `<node>_output`, `from: output`. Lore's prompts answer in their output |
| `repo_workdir: false` | The repo is cloned with `access: read` |
| `continues: { key: args.x }` | `conversation: continue`, `conversationKey: x` |
| `by_hand: true` | The node's start event is `manual.<line>.<node>` |
| the terminal `retrospective` | A node with no station |
| a review node a person works | A human station. Its `route`'s `{args.x}` is `{x}` |
| any other node | A service station, named after its job |
| `iteration_max` | `iterationMax` |

## What is not in lore's files

An assembly line's file does not say what starts it, what it is given, or what lore's floor did in code around it. `known-lines.ts` holds that, one assembly line at a time, each read by hand from lore's code. One with no entry there still converts, with the default arguments and no start event, and says so in its notes.

Today it holds three:

- `code-review` starts when a pull request opens.
- `code-review-recheck` never starts by itself. A push goes to a `review-router` station, which asks for one or the other of these two. That station is not in this repository, and lore is expected to run it.
- `code-review-reply` starts when a trusted person submits a review asking for changes.

The first two have a `post-review` station where lore's floor posted the review from a hook, and the third has a `post-reply` one.

A service station converts with no needs and no produces, because what a lore job read and wrote is in its code. Each is noted.

## Checked

Every converted assembly line is run through the floor's own `validateLine`, against the stations it comes with. What the floor would refuse is a note.
