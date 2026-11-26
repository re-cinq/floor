---
title: Graph SDK
description: Render an assembly line in React, select a station, and inspect the route a run took.
---

{{intro}}

Install {{package}} with `npm install @re-cinq/floor-graph` in a React 19 application. Use a bundler that resolves CSS Modules, such as Vite. The package imports its component styles; your application supplies theme colors and a container with a height.

## Explore the Hello World line

Select **Greet** to read the station description. Turn on **Show completed run** to follow the successful visit to **Done**. **Whole line** brings the unused **Broken** branch back into view.

<iframe title="Interactive Hello World graph" src="/floor/demos/hello-world-graph/index.html" style="width:100%;height:31rem;border:0"></iframe>

[Build this graph in React](/floor/tutorials/hello-world-graph/) or [view the example’s browser tests]({{test}}).

## Component inputs

| Input | What to pass |
| --- | --- |
| `definition` | An [AssemblyLineDefinition](/floor/sdk/graph/#assemblylinedefinition) containing the graph’s nodes and outcome-labelled edges. |
| `onSelectNode`, `selectedNodeId` | The callback receives the selected node’s ID. Store it in React state and pass it back to the view to mark the selection. |
| `run.visits` | A [Visit](/floor/sdk/graph/#visit) for each pass through a station. A closed visit’s outcome determines the edge the graph marks as taken. |
| `show` | With a run, the graph initially shows the visited route. Set `show="all"` to start with the full definition. |

For TypeScript projects, we recommend [Floor’s ESLint rules](https://www.npmjs.com/package/@re-cinq/eslint-plugin-re-lint) as a development dependency.

## API reference
