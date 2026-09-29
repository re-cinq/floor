# Floor: the plan

A standalone Floor, compatible with lore. Read in this order.

For what the pieces are and how they fit together — the map, the invariants, and the path an event
takes through them — start at [the repository's README](../README.md). These pages are the design
underneath it.

## Start here

[Tutorial](tutorial.md): install floor with Helm, register a cluster, import a line and run it.

## The entities

1. [Station](entities/station.md): one unit of work, one function, three kinds
2. [Agent definition](entities/agent-definition.md): model, prompt, timeout, tags, repo variants
3. [Assembly line](entities/assembly-line.md): nodes and edges, with four of lore's lines converted
4. [Assembly run](entities/assembly-run.md): a run and its visits, traced step by step

## The design

- [API sketch](api_sketch.md): every endpoint, the conventions, the lore compatibility table and the converter
- [Assembly run storage](assembly_run_storage.md): the model, routing, dispatch, events, costs, tables, and the mapping from lore's columns
- [Development loop](dev_loop.md): minikube, hot reload, one command

## What is built

The pages above describe the floor as it runs. Where a section describes
something designed and not yet written, it starts with **Not built yet**;
whoever builds it removes the mark. Nothing unmarked should be false.

- [Decisions](decisions.md): the calls made while building, which are neither design nor bug
- `npm start`: the floor on this machine, reloading on save; see [Development loop](dev_loop.md)
- `scripts/walk.sh` and `scripts/walk-agent.sh`: a run end to end over HTTP, through a service station and through a real agent pod

Definitions are written here as authored YAML, in `snake_case`. The API
takes the same fields as JSON in `camelCase` (`agent_definition` is
`agentDefinition`). `floor-pipeline` (`packages/pipeline`) converts one to
the other: a pipeline as one YAML file, out of a floor and into one.

## The reviews

- [Comparison with lore](reviews/comparison_with_lore.md): first pass, the walk itself
- [Second pass](reviews/review_second_pass.md): everything around the walk, and the complexity check

Both reviews are applied. They are kept as the record of why the plan looks
the way it does.
