# @re-cinq/floor-graph

A React view of an assembly line as a graph: layout, pan and zoom, nodes and edges. It ships compiled JS and its CSS modules, so use it from a bundler such as Vite.

```
npm install @re-cinq/floor-graph
```

```tsx
import { RunGraphView, type AssemblyLineDefinition } from "@re-cinq/floor-graph";

<RunGraphView definition={definition} />;
```

Copied from re-cinq/lore-security `apps/web-ui/src` at commit 4598c19791154a2ae6afffa65e8b26c0825140b6, with everything about a run stripped.
