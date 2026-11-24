# @re-cinq/floor-graph

A React view of an assembly line as a graph: layout, pan and zoom, nodes and edges. [elkjs](https://github.com/kieler/elkjs) lays the line out: stations left to right, every line on its own ports, routed at right angles around stations and labels. It ships compiled JS and its CSS modules, so use it from a bundler such as Vite.

```
npm install @re-cinq/floor-graph
```

```tsx
import { RunGraphView, type AssemblyLineDefinition } from "@re-cinq/floor-graph";

<RunGraphView definition={definition} />;
```

The controls hold zoom, fit and two toggles. "Main path" fades every station and line off the path from the entry along `success` (or the first `always` when nothing succeeds). "Compact stops" draws a station with one line in and one `always` line out as a stop on the track, unless it is the entry or is started from outside. The `mainPathOnly` and `compactStops` props set where each toggle starts. `onSelectLine(key)` and `selectedLineKey` select a line by its `from|to|event` key (`edgeKeyOf`).

Started as a copy of re-cinq/lore-security `apps/web-ui/src` at commit 4598c19791154a2ae6afffa65e8b26c0825140b6, with everything about a run stripped. The layout is no longer lore's.
