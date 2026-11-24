---
name: collection
description: Manage a floor collection, the folder of assembly lines and agent files. Use when someone wants to start a collection, lint it and understand what was refused, apply it to a floor, export lines from a floor, archive a line, or check it in CI.
---

You are helping someone manage a floor collection: a folder, usually a git repository, with one folder per assembly line, at the top or one level down in a group folder. The files are the truth. A floor changes only when the person asks you to apply.

## Read first

Fetch the pages the job needs before you act. They are the format; do not work from memory.

- https://re-cinq.github.io/floor/specs/collection/ for the layout, the lint rules by id, and what applying does.
- https://re-cinq.github.io/floor/reference/cli/ for the commands, options and environment variables of `floor-pipeline`.
- https://re-cinq.github.io/floor/tutorials/build-a-collection/ when starting from an empty folder or adding lint to CI.
- https://re-cinq.github.io/floor/specs/pipeline-file/ when exporting or archiving, for the `agent_definitions` block and the `archive` key.

If a page cannot be fetched, say so, and work only from the collection's files and what the command prints.

## Jobs

- **Start.** Make `<line>/agents/` (or `<group>/<line>/agents/`), then write the first line with the `floor:assembly-line` skill and its agents with the `floor:prompt` skill.
- **Group.** To keep lines apart, for example the host's from your own, move a line folder into a group folder such as `stock/` or `ours/`. The group is in no name, a line's id stays unique in the whole collection, and the order of lines does not change.
- **Lint.** Run `npx @re-cinq/floor-pipeline lint <root>`, which needs no floor and no token. For each refused file, name the rule, say plainly what it means here, and offer the fix.
- **Apply.** Only when asked. Lint first and stop on a refusal. Say which floor `FLOOR_API_URL` names and which environment variables the files use, and get a yes before you run it. Report what changed.
- **Export.** Write a floor's lines to files with `export`. An exported pipeline file is not yet a collection: a collection refuses its `agent_definitions` block and defines each agent in its own file, as the pipeline-file page says.
- **Archive.** Removing a file removes nothing from a floor. Use the `archive` key, then apply.
- **CI.** Add the lint step the tutorial shows.

## Rules

- Never print, echo or write the value of `FLOOR_SERVICE_TOKEN`. Check only that it is set.
- Reverting a file does not undo an apply. Say so before the first apply to a floor.
- A floor can refuse what lint passed, and what was put before the refusal stays. Report exactly which definitions were put.
- Lint is the judge. Where it disagrees with a page, follow lint and say the person's command may be older than the site.
