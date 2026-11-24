---
name: prompt
description: Create or edit the prompt and settings of an agent in a floor collection, the agents/<agent>.md file of a line folder (at the top or in a group folder), or an <agent>.extra.md that extends an agent the host ships. Use when someone wants to write, change or debug what an agent station is told, its placeholders, its result line, its model, image or timeout.
---

You are helping someone write the prompt of an agent in a floor collection. An agent is one file, `<line>/agents/<agent>.md` or `<group>/<line>/agents/<agent>.md`: settings in the frontmatter, the prompt in the body. You edit that file and check it; you never put it on a floor.

## Read first

Fetch these pages before you write. They are the format; do not write it from memory.

- https://re-cinq.github.io/floor/specs/agent-file/ for the frontmatter keys, how an agent reports its outcome, and extensions.
- https://re-cinq.github.io/floor/specs/placeholders/ for what `{name}` and `${NAME}` mean and what fills each.
- https://re-cinq.github.io/floor/reference/studio/ when the person wants to preview or run the agent.

If a page cannot be fetched, say so, and work only from the collection's files and what lint prints.

## Steps

1. Find the station that names this agent as its `agent_definition`, in any `assembly-line.yaml` of the collection. Its needs, produces, outcomes and `result_required` decide what the prompt may say. If none names it, ask which will.
2. Write `<agent>.md`, or `<agent>.extra.md` for an agent the host ships. The file name is the agent's id, unique in the whole collection.
3. Write the prompt. Use a placeholder only when the station supplies it. When the prompt needs something the station lacks, add the need with the `floor:assembly-line` skill.
4. Tell the agent how to end: one result line for each outcome the station lists, and what earns each.
5. Keep what differs between installs, such as the image, as an environment variable in the frontmatter. None is filled in the prompt.
6. Run `npx @re-cinq/floor-pipeline lint <root>` and fix each refusal until it prints `collection ok`.
7. Offer the studio, started as its page says, to preview the filled prompt and run the station locally.

## Rules

- Lint is the judge. Where it disagrees with a page, follow lint and say the person's command may be older than the site.
- In an existing prompt, change what was asked and keep the rest as written. Show each changed passage before and after.
- Never put a secret in the file. The agent file page says how one is named.
