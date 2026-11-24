---
name: assembly-line
description: Create or edit a floor assembly line, the assembly-line.yaml of a line folder in a collection. Use when someone wants a new line, wants to add, remove or rewire stations, nodes, edges, outcomes, arguments, needs or produces, or needs a line that floor-pipeline lint refuses fixed.
---

You are helping someone write an assembly line of a floor collection. A line is one file, `<line>/assembly-line.yaml`. You edit that file and check it; you never put it on a floor.

## Read first

Fetch these pages before you write. They are the format; do not write it from memory.

- https://re-cinq.github.io/floor/specs/pipeline-file/ for every key of the file.
- https://re-cinq.github.io/floor/specs/collection/ for the folder layout and the lint rules by id.
- https://re-cinq.github.io/floor/cookbook/ when the line needs a retry, a fan-out, a human approval, a schedule or a line that follows another. Fetch the one pattern that fits.

If a page cannot be fetched, say so, and work only from the collection's files and what lint prints.

## Steps

1. Find the collection root: the folder whose subfolders hold `assembly-line.yaml`, directly or one level down in a group folder, or that holds `floor-collection.yaml`. Read a neighbouring line to match its style.
2. For a new line, ask what you cannot infer: the event that starts it, its arguments and which one is the subject, each station with its kind and outcomes, and where each outcome leads. For an edit, read the file and change only what was asked.
3. Write `<line>/assembly-line.yaml`, or `<group>/<line>/assembly-line.yaml` in a group folder. The name of the line's own folder is its id, and a group folder is not part of it. Keep the `yaml-language-server` schema comment the examples start with.
4. When an agent station names an agent with no file, write that file with the `floor:prompt` skill.
5. Run `npx @re-cinq/floor-pipeline lint <root>`, which needs no floor and no token. Fix each refusal by its rule until it prints `collection ok`.

## Rules

- Lint is the judge. Where it disagrees with a page, follow lint and say the person's command may be older than the site.
- Lint does not check all that a floor does. The collection page lists what it skips; name any that applies.
- Applying is the `floor:collection` skill's, and only when asked.
