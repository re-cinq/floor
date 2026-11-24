---
title: The floor-pipeline command
description: The commands, options, environment variables and exit codes of floor-pipeline.
wordBudget: 300
sidebar:
  order: 2
---

`floor-pipeline` moves pipeline files and collections between disk and a floor. It speaks only the [HTTP API](/floor/reference/http-api/). Run it with `npx @re-cinq/floor-pipeline`.

## Commands

| Command | Takes | What it does |
| --- | --- | --- |
| `export <line>` | A line id | Writes the line's latest version and what it names as one [pipeline file](/floor/specs/pipeline-file/), to standard output or `--out` |
| `export --all --dir <dir>` | A folder | Writes one file per line, named after it |
| `import <file>...` | Pipeline files | Puts each file to the floor. The same file twice changes nothing |
| `migrate <dir>` | A folder of `.yaml` files | Runs the files in the order of their names, each once. The floor remembers which ran |
| `lint <dir>` | A [collection](/floor/specs/collection/) | Checks it against the collection rules. Needs no floor and no token |
| `apply <dir>` | A collection | Puts its agents, then each line with its stations. Puts nothing when a file is refused |

## Options

| Option | For | What it does |
| --- | --- | --- |
| `--floor <url>` | Every command but `lint` | The floor to talk to. Leave it out when `FLOOR_API_URL` is set |
| `--out <file>` | `export` | Writes to a file instead of standard output |
| `--dir <dir>` | `export --all` | The folder to write into |
| `--all` | `export` | Every line |
| `--wait-ready <seconds>` | Every command but `lint` | First waits for `/readyz` to answer 200, and fails if it does not in time |
| `--host-key <name>` | `lint`, `apply` | Names a settings key the host owns, beside the `host_keys` of the collection's `floor-collection.yaml`. Repeat it |

`lint` and `apply` also read `groups` from `floor-collection.yaml`. There is no flag for it.

## Environment variables

| Variable | What it holds |
| --- | --- |
| `FLOOR_API_URL` | The floor to talk to, when `--floor` is not given. A station's worker reads the same name |
| `FLOOR_SERVICE_TOKEN` | The service token. Every command but `lint` needs it |
| `${NAME}` | In the files of a collection, filled from the environment by `apply` |

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Done |
| `1` | A file was refused, the floor refused a call, a line does not exist, or an argument is missing |

## Examples

```bash
npx @re-cinq/floor-pipeline export launch-approval --out launch.yaml
npx @re-cinq/floor-pipeline export --all --dir backup/
```

```text
11 pipeline(s) written to backup/
```

```bash
npx @re-cinq/floor-pipeline import launch.yaml
```

```text
launch.yaml:
  stations/launch-signoff: as it was
  assembly-lines/launch-approval: as it was
```

```bash
npx @re-cinq/floor-pipeline migrate migrations/ --wait-ready 180
```

```text
0001-launch.yaml:
  stations/launch-signoff: as it was
  assembly-lines/launch-approval: as it was
```

A second run prints `0001-launch.yaml: ran before`.

```bash
npx @re-cinq/floor-pipeline lint collection/
```

```text
collection ok: 0 agents, 1 pipelines, 0 extensions
```

```bash
npx @re-cinq/floor-pipeline apply collection/
```

```text
collection/:
  stations/launch-signoff: changed
  assembly-lines/launch-approval: changed
```
