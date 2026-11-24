# @re-cinq/floor-pipeline

A pipeline as one file: an assembly line with its stations, its agent definitions and their prompts, its files and its schedules. One file is one pipeline, and holds everything the pipeline needs that a file can hold.

```
npm install @re-cinq/floor-pipeline      # the command is floor-pipeline

export FLOOR_SERVICE_TOKEN=...
export FLOOR_API_URL=http://localhost:8180

floor-pipeline export code-review > code-review.yaml
floor-pipeline export --all --dir backup/
floor-pipeline import code-review.yaml
floor-pipeline migrate pipelines/
floor-pipeline migrate pipelines/ --floor http://floor-api:8080 --wait-ready 180
```

`--floor <url>` names the floor for one call and wins over `FLOOR_API_URL`, the name a station's worker reads too.

| command | what it does |
|---|---|
| `export <line>` | Writes the assembly line's latest version, and what it names, as one file |
| `export --all --dir <dir>` | One file per assembly line, named after it: a backup |
| `import <file>...` | Puts each file to the floor. The same file twice changes nothing, because a version is its content |
| `migrate <dir>` | Runs the folder's files in the order of their names, each once |
| `--wait-ready <seconds>` | First polls the floor's `/readyz` until it answers 200. If it does not in time, it fails, naming the floor and the seconds. For a job that starts with the floor, such as the chart's seed Job |

## Where this fits

The tool is a client of a [floor](https://github.com/re-cinq/floor) and nothing more. It speaks the floor's HTTP API with a service token, as lore or a worker does, and links none of floor's own packages.

[`@floor/lore-converter`](https://github.com/re-cinq/floor/blob/main/packages/lore-converter/README.md) brings an assembly line in from lore. This tool moves a whole pipeline between a file and a floor, to review it, to keep it in git, or to put the same one into another floor. It moves definitions only. Assembly runs stay where they happened.

See [the map](https://github.com/re-cinq/floor/blob/main/README.md).

## The file

The file is YAML in `snake_case`, as the docs write definitions. Every prompt is in it as a block.

```yaml
line:
  id: code-review
  entry: review
  exit: done
  args:
    pr_url: { kind: value, subject: true }
  files:
    checklist: |
      - read the spec
      - read the diff
  nodes:
    - { id: review, station: code-review }
    - { id: done }
  edges:
    - { from: review, to: done, on: success }
    - { from: review, to: review, on: failed, iteration_max: 1 }
stations:
  code-review:
    kind: agent
    agent_definition: reviewer
    outcomes: [success, failed]
    needs: [{ name: pr_url, kind: value }]
    produces: []
agent_definitions:
  reviewer:
    settings:
      model: gemini-3.1-pro-preview
      image: node:22-bookworm
      timeout_minutes: 25
      prices:
        gemini-3.1-pro-preview: { input_per_million: 2, output_per_million: 12 }
      prompt: |
        Review {pr_url}.
schedules:
  nightly: { cron: "0 3 * * *", payload: { pr_url: https://pr/1 } }
```

- An assembly line may name a `fail` node beside its `exit`: `fail: failed`, with `- { id: failed }` among its nodes. An assembly run that an edge leads there settles as `failed`. Written back, `fail` comes right after `exit`.
- The floor's own fields change spelling, `timeout_minutes` to `timeoutMinutes`. Names a person chose do not: a model's name, a repository's, a key of `config` or of `env`.
- A file an assembly line ships is in the pipeline file by its content. Text is kept as it is, anything else as `{ base64: ... }`. The floor keeps it by its hash, and a hash is no backup.
- A station two assembly lines use is in both files. Put twice with the same content, it is one version.
- What is exported is what runs now, which is each definition's latest version. Older versions stay on the floor and are not in the file.

## What a file cannot hold

| | where it is |
|---|---|
| Secrets: a model's key, an MCP server's token | In the cluster's `agent-secrets`. A definition names the key, and never the value |
| The program behind a service station | Wherever it runs. The file declares the station. The program that posts a review is lore's |
| Runs, visits, their records and costs | In the floor's database. This is a backup of what a floor is told to do, and not of what it did |

## A collection

A collection is a folder of assembly lines. Each one has its own folder, with its pipeline and its agents. A line folder may sit one level down, in a group folder such as `stock/`. The group is in no name, and a line's id is unique in the whole collection. An agent is a markdown file: the frontmatter holds its settings, and the body is its prompt. A file named `<agent>.extra.md` adds to the prompt of an agent the host already ships.

```
code-review/
  assembly-line.yaml
  agents/
    reviewer.md
    reviewer.extra.md
```

With Claude Code, the [floor skills](https://re-cinq.github.io/floor/reference/skills/) write these files and run `lint` after every change.

### lint

`lint` checks a collection without a floor and without a token.

```
floor-pipeline lint collection/ --host-key execution_mode
```

A key that belongs to the host is named in the collection's `floor-collection.yaml` (`host_keys: [execution_mode]`), or with `--host-key`, as often as needed. `lint` and `apply` use both.

`lint` asks the same questions the floor asks of an assembly line, through [`@re-cinq/floor-assembly-lines`](../assembly-lines/README.md). Two of its rules:

- `unseeded-need` is a need that is neither a line argument or file nor produced on every path into its node. Its message gives one path that arrives without it.
- `unsupplied-input` is a `{name}` in an agent's prompt that the station does not give.

What a station gives a prompt:

| source | placeholder |
|---|---|
| a value need | `{name}` |
| a file or git need, and a produce with a path | `{name_path}` |
| the floor | `{run_id}`, `{line_id}`, `{node_id}` |
| the floor, for a retry or a fan-out branch | `{previous_error}`, `{previous_failures}`, `{item}` |
| the floor, for a station with a git need | `{git_credential}`, `{git_credential_url}` |

A prompt's `{name}` is made of letters, digits, `_`, `.` and `-`, and starts with a letter or `_`, so a JSON object in a prompt is never read as one.

A collection may extend an agent the host ships with an `.extra.md` file, or name a shipped agent without defining it. Without the host's catalog `lint` refuses both. `--shipped <dir>` names a directory in the same layout, whose assembly lines and agents are the shipped ones.

```
floor-pipeline lint collection/ --shipped shipped/ --host-key execution_mode
```

A refused file prints one line and the exit code is 1. A call with no directory prints the usage and the exit code is 2.

```
code-review/assembly-line.yml: a collection does not read this path: a line folder holds assembly-line.yaml, agents/<agent>.md and agents/<agent>.extra.md
```

A clean collection prints a summary and the exit code is 0.

```
collection ok: 1 agents, 1 pipelines, 0 extensions
```

### apply

`apply` puts a collection to a floor: its agents, then each assembly line with its stations. `${NAME}` in its files is filled from the environment. When a file is refused, nothing is put.

```
floor-pipeline apply collection/
```

## Migrations

`migrate` is for seeding a floor at deploy, and for changing it after. It runs a folder's files in the order of their names, each once.

```
pipelines/
  0001-code-review.yaml
  0002-code-review-reply.yaml
  0003-code-review.yaml          a changed prompt
  0004-remove-gap-fill.yaml      archive: { lines: [gap-fill] }
```

- The floor remembers which files ran, by name and by the sha256 of what they held: `GET /migrations`.
- A file that ran is not run again. So what a person changes over HTTP stays, until a later file changes that pipeline.
- A file that ran and was changed since is refused. What it did is done. A change is a new file.
- A file the floor refused is not remembered, and runs when it is mended.
- A pipeline leaves as it came, by a file. `archive` names the assembly lines, stations, agent definitions and schedules to archive. The floor refuses to archive an assembly line with open runs.

A file is several requests, so a file the floor refuses half way has put what came before. Putting is safe to repeat, so the mended file puts the rest.
