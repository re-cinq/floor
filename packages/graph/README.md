# @re-cinq/floor-graph

A React view of an assembly line as a graph: layout, pan and zoom, nodes and edges. [elkjs](https://github.com/kieler/elkjs) lays the line out: stations left to right, every line on its own ports, routed at right angles around stations and labels. It ships compiled JS and its CSS modules, so use it from a bundler such as Vite.

```
npm install @re-cinq/floor-graph
```

```tsx
import { RunGraphView, type AssemblyLineDefinition } from "@re-cinq/floor-graph";

<RunGraphView definition={definition} />;
```

The controls hold zoom, fit and two toggles. "Main path" fades every station and line off the path from the entry along `success` (or the first `always` when nothing succeeds). "Compact stops" draws a station with one line in and one `always` line out as a stop on the track, unless it is the entry or is started from outside. The `mainPathOnly` and `compactStops` props set where each toggle starts. `onSelectLine(key)` and `selectedLineKey` select a line by its `from|to|event` key (`edgeKeyOf`). On a focused station, Down and Up choose one of its out-lines (drawn bold), Right moves to the station that line leads to, Left goes back along an in-line, and Enter selects. When the definition changes, new stations and lines flash for 1.2 s (`diffLayouts` against the last layout; the first draw flashes nothing) and moved lines slide to their new route. A station that moves after an edit slides to its new place over 400 ms; motion is off under `prefers-reduced-motion`.

Pass `run={{ visits }}` (`Visit`: `nodeId`, `iteration`, `outcome?`, `open`) to overlay one assembly run. A line the run did not take fades to 30% (`takenLinesOf`, lore's first-match rule). A line taken more than once shows ×N beside its label, and the layout reserves room for it. An unvisited station fades to 40%; a visited card's own border takes the colour of its last closed outcome, its subtitle counts visits above one (`agent · 2 visits`), and while a visit is open it adds ` · open` and the border pulses. With a run, `show` defaults to `"visited"`: ELK lays out only the entry, the visited stations, the lines the run took and the stations they reach (`visitedPartOf`), so the graph stays small. A "Whole line" toggle brings in the rest, faded; `show="all"` starts there.

Started as a copy of re-cinq/lore-security `apps/web-ui/src` at commit 4598c19791154a2ae6afffa65e8b26c0825140b6, with everything about a run stripped. The layout is no longer lore's.
