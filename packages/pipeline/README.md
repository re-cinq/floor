# @re-cinq/floor-pipeline

A pipeline as one file: an assembly line with its stations, its agent definitions and their prompts, its files and its schedules. One file is one pipeline, and holds everything the pipeline needs that a file can hold.

The tool speaks the HTTP API of a [floor](https://github.com/re-cinq/floor) and nothing else. It is a client like any other, with the service token.

```
npm install @re-cinq/floor-pipeline      # the command is floor-pipeline

export FLOOR_SERVICE_TOKEN=...

floor-pipeline export code-review --floor http://localhost:8180 > code-review.yaml
floor-pipeline export --all --dir backup/ --floor http://localhost:8180
floor-pipeline import code-review.yaml --floor http://localhost:8180
floor-pipeline migrate pipelines/ --floor http://localhost:8180
floor-pipeline migrate pipelines/ --floor http://floor-api:8080 --wait-ready 180
```

| command | what it does |
|---|---|
| `export <line>` | writes the line's latest version, and what it names, as one file |
| `export --all --dir <dir>` | one file a line, named after it: a backup |
| `import <file>...` | puts each file to the floor. The same file twice changes nothing: a version is its content |
| `migrate <dir>` | the folder's files in the order of their names, each once |
| `--wait-ready <seconds>` | first polls the floor's `/readyz` until it answers 200, and fails, naming the floor and the seconds, if it does not in time. For a job that starts with the floor, such as the chart's seed Job |

## Where this fits

A client and nothing more: it speaks the floor's HTTP API with a service token, exactly as lore or
a worker does, and links none of floor's own packages. Where
[`@floor/lore-converter`](https://github.com/re-cinq/floor/blob/main/packages/lore-converter/README.md) brings an assembly line *in* from lore, this
moves a whole pipeline between a file and a floor — to review it, to keep it in git, or to put the
same one into another floor. It moves definitions only; assembly runs stay where they happened.

See [the map](https://github.com/re-cinq/floor/blob/main/README.md).

## The file

YAML, in `snake_case`, as the docs write definitions. Every prompt is in it, as the block it is.

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

- **The floor's own fields change spelling**, `timeout_minutes` to `timeoutMinutes`. Names a person chose do not: a model's name, a repository's, a key of `config` or of `env`.
- **A file a line ships is in the file by its content.** Text as it is; anything else as `{ base64: ... }`. The floor keeps it by its hash, and a hash is no backup.
- **A station two lines use is in both files.** Put twice with the same content, it is one version.
- **What is exported is what runs now**: each definition's latest version. Older versions stay on the floor and are not in the file.

## What a file cannot hold

| | where it is |
|---|---|
| Secrets: a model's key, an MCP server's token | in the cluster's `agent-secrets`. A definition names the key, and never the value |
| The program behind a service station | wherever it runs. The file declares the station; the program that posts a review is lore's |
| Runs, visits, their records and costs | in the floor's database. This is a backup of what a floor is told to do, and not of what it did |

## Migrations

`migrate` is for seeding a floor at deploy, and for changing it after. It runs a folder's files in the order of their names, each once.

```
pipelines/
  0001-code-review.yaml
  0002-code-review-reply.yaml
  0003-code-review.yaml          a changed prompt
  0004-remove-gap-fill.yaml      archive: { lines: [gap-fill] }
```

- **The floor remembers which files ran**, by name and by the sha256 of what they held: `GET /migrations`.
- **A file that ran is not run again.** So what a person changes over HTTP stays, until a later file changes that pipeline.
- **A file that ran and was changed since is refused.** What it did is done. A change is a new file.
- **A file the floor refused is not remembered**, and runs when it is mended.
- **A pipeline leaves as it came, by a file**: `archive` names the lines, stations, agent definitions and schedules to archive. The floor refuses to archive a line with open runs.

A file is several requests, and not one: a file the floor refuses half way has put what came before. Putting is safe to repeat, so the mended file puts the rest.
