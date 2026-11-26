---
title: Render your first assembly line in React
description: Display the Hello World line, select a station, and trace a completed run.
---

This example uses the [Hello World station](/floor/tutorials/hello-world-station/) and a recorded successful visit. You can try it without starting a Floor server.

## Create the React app

In a React 19 TypeScript project with Vite, install the graph package:

```sh
npm install @re-cinq/floor-graph
```

If you need a project, run `npm create vite@latest hello-graph -- --template react-ts`, enter the `hello-graph` directory, and install the package there.

## Describe the line and visit

Save this as `src/hello.ts`. The [definition](/floor/sdk/graph/#assemblylinedefinition) uses node IDs for the ends of each edge. The [visit](/floor/sdk/graph/#visit) identifies the greeting node by that same ID.

{{hello.ts}}

## Select a node and follow a run

Replace `src/App.tsx` with this component. The [selection callback](/floor/sdk/graph/#rungraphviewprops) receives a node ID. Use it to look up the description and pass it back to the graph as `selectedNodeId`. Checking the box supplies the recorded visit to the view.

{{App.tsx}}

## Give the graph room to draw

Save this as `src/graph.css`. The flex container reserves height for the graph while its bundled CSS Modules handle the canvas, nodes, and controls.

{{graph.css}}

Run `npm run dev` and open the URL printed by Vite. Select **Greet** to see “Produces a greeting from the supplied name.” Check **Show completed run**: **Greet** and **Done** remain visible. Press **Whole line** to see **Broken** again. You can also [try the running example](/floor/sdk/graph/#explore-the-hello-world-line).
