# Floor: the plan

A standalone Floor, compatible with lore. Read in this order.

For the map, the invariants and the path an event takes through the pieces, start at [the repository's README](../README.md).

## Start here

The documentation people read is the website, https://re-cinq.github.io/floor/. It holds what floor is, the tutorials, the specifications of the pipeline file, the agent file and the collection, and the references. Its sources are in [`website/`](../website/), and its field tables are generated from the code.

The pages in this folder are the design underneath it, and what the code's own comments point at.

- [Install Floor and run your first line](tutorial.md) takes you from a Kubernetes cluster to a running agent line. The website has no page for this yet.
- [Use](using.md) covers the CLI, the client, a service station of your own, and the HTTP API.

The entity pages that were here are retired. What a station, an agent definition, an assembly line and an assembly run are is on the website's [concepts](https://re-cinq.github.io/floor/concepts/assembly-line/) and [specifications](https://re-cinq.github.io/floor/specs/pipeline-file/). The run traces are in [assembly_run_storage.md](assembly_run_storage.md#two-runs-traced), and lore's converted assembly lines are in the [lore-converter README](../packages/lore-converter/README.md#four-of-lores-assembly-lines-converted).

## The design

- [API sketch](api_sketch.md): every endpoint, the conventions, the lore compatibility table and the converter
- [Assembly run storage](assembly_run_storage.md): the model, routing, dispatch, events, costs, tables, and the mapping from lore's columns
- [Development loop](dev_loop.md): minikube, hot reload, one command
- [Releasing](releasing.md): a tag publishes the image, the chart and the seven npm packages. The [chart's README](../deploy/chart/README.md#how-recinq-deploys-it) is how Argo CD deploys a merge

## What is built

The pages above describe the floor as it runs. A section that describes something designed and not yet written starts with **Not built yet**, and whoever builds it removes the mark. Nothing unmarked should be false.

- [Decisions](decisions.md): the calls made while building, which are neither design nor bug
- `npm start`: the floor on this machine, reloading on save, see [Development loop](dev_loop.md)
- `scripts/walk.sh` and `scripts/walk-agent.sh`: a run end to end over HTTP, through a service station and through a real agent pod

Definitions are written here as authored YAML, in `snake_case`. The API takes the same fields as JSON in `camelCase` (`agent_definition` is `agentDefinition`). `floor-pipeline` (`packages/pipeline`) converts one to the other. It moves a pipeline as one YAML file out of a floor and into one.

## The reviews

- [Comparison with lore](reviews/comparison_with_lore.md): first pass, the walk itself
- [Second pass](reviews/review_second_pass.md): everything around the walk, and the complexity check

Both reviews are applied. They are kept as the record of why the plan looks the way it does.
