---
title: Build a collection from scratch
description: Turn an empty folder into a collection with one line and one agent that lints clean and is applied to a floor.
wordBudget: 450
sidebar:
  order: 6
---

At the end, an empty folder is a [collection](/floor/concepts/collection/) with one line, `summarize-issue`, and one agent, and floor holds both. Running the agent's visit needs a cluster agent.

1. Make the folders.

   ```sh
   mkdir -p my-collection/summarize-issue/agents
   ```

2. Write `my-collection/summarize-issue/assembly-line.yaml`. It has one `agent` station. The argument leaves out `subject: true`, which a first-timer forgets.

   ```yaml
   line:
     id: summarize-issue
     entry: summarize
     exit: done
     fail: stopped
     args:
       issue_url: { kind: value }
     nodes:
       - { id: summarize, station: summarize-issue }
       - { id: done }
       - { id: stopped }
     edges:
       - { from: summarize, to: done, on: success }
       - { from: summarize, to: stopped, on: failed }
   stations:
     summarize-issue:
       description: An agent summarizes one issue into a file.
       kind: agent
       agent_definition: issue-summarizer
       outcomes: [success, failed]
       needs:
         - { name: issue_url, kind: value }
       produces:
         - { name: summary, kind: file, path: summary.md }
   ```

3. Write `my-collection/summarize-issue/agents/issue-summarizer.md`. The prompt uses the need `{issue_url}` and the path `{summary_path}` of the produce.

   ```markdown
   ---
   image: ${AGENT_IMAGE}
   timeout_minutes: 10
   ---
   Read the issue at {issue_url}. Write a three-line summary of it into {summary_path}.

   When the file is written, end your reply with this line on its own:

   LORE_NODE_RESULT: success
   ```

4. Lint it. Lint needs no floor and no variables.

   ```sh
   npx @re-cinq/floor-pipeline lint my-collection
   ```

   ```text
   summarize-issue/assembly-line.yaml: no arg carries subject: true, so the floor cannot refuse a second run for the same subject
   ```

5. Fix it. Change the argument to `issue_url: { kind: value, subject: true }` and lint again. A file named `assembly-line.yml` is refused too, and the [rules](/floor/specs/collection/#2-rules) list the rest.

   ```text
   collection ok: 1 agents, 1 pipelines, 0 extensions
   ```

6. Apply it with the image set. `FLOOR_API_URL` and `FLOOR_SERVICE_TOKEN` say which floor.

   ```sh
   AGENT_IMAGE=ghcr.io/acme/agent:1 npx @re-cinq/floor-pipeline apply my-collection
   ```

   ```text
   my-collection:
     agent-definitions/issue-summarizer: changed
     stations/summarize-issue: changed
     assembly-lines/summarize-issue: changed
   ```

7. Apply again. Nothing changes, so it is safe to repeat.

   ```text
   my-collection:
     agent-definitions/issue-summarizer: as it was
     stations/summarize-issue: as it was
     assembly-lines/summarize-issue: as it was
   ```

8. Check it in CI with a step in `.github/workflows/lint.yml`. To also draw what each pull request changes, use [the pull request workflow](/floor/tutorials/check-a-pack-on-every-pull-request/) instead.

   ```yaml
   steps:
     - uses: actions/checkout@v4
     - uses: actions/setup-node@v4
       with: { node-version: 22 }
     - run: npx @re-cinq/floor-pipeline lint .
   ```

9. Keep a host's lines apart from yours. Move `summarize-issue` into `my-collection/stock/` and copy it to `my-collection/ours/`. Name the order in `my-collection/floor-collection.yaml`.

   ```yaml
   groups:
     - stock
     - ours
   ```

   ```sh
   npx @re-cinq/floor-pipeline lint my-collection
   ```

   ```text
   collection ok: 1 agents, 1 pipelines, 0 extensions
   ```

   `ours/` is read and `stock/` is left out. Without the list, the files in `stock/` are refused as already set by those in `ours/`.

With Claude Code, [the floor skills](/floor/reference/skills/) do these steps for you.
