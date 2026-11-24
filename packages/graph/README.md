# @re-cinq/floor-graph

A React view of an assembly line as a graph: layout, pan and zoom, nodes and edges. [elkjs](https://github.com/kieler/elkjs) lays it out with stations left to right, every edge on its own ports, routed at right angles around stations and labels. The package ships compiled JS and its CSS modules, so use it from a bundler such as Vite.

```
npm install @re-cinq/floor-graph
```

```tsx
import { RunGraphView, type AssemblyLineDefinition } from "@re-cinq/floor-graph";

<RunGraphView definition={definition} />;
```

## Controls

The controls hold zoom, fit and two toggles. The `mainPathOnly` and `compactStops` props set where each toggle starts.

- "Main path" fades every station and edge off the path from the entry along `success`, or along the first `always` when nothing succeeds.
- "Compact stops" draws a station with one edge in and one `always` edge out as a stop on the track, unless it is the entry or is started from outside.

## Selection and keyboard

`onSelectLine(key)` and `selectedLineKey` select an edge by its `from|to|event` key (`edgeKeyOf`).

On a focused station, Down and Up choose one of its outgoing edges, which is drawn bold. Right moves to the station that edge leads to, Left goes back along an incoming edge, and Enter selects.

## When the definition changes

New stations and edges flash for 1.2 s (`diffLayouts` against the last layout, and the first draw flashes nothing). Moved edges slide to their new route, and a station that moves slides to its new place over 400 ms. Motion is off under `prefers-reduced-motion`.

## Overlaying an assembly run

Pass `run={{ visits }}` to overlay one assembly run. A `Visit` is `nodeId`, `iteration`, `outcome?` and `open`.

- An edge the run did not take fades to 30% (`takenLinesOf`, lore's first-match rule).
- An edge taken more than once shows ×N beside its label, and the layout reserves room for it.
- An unvisited station fades to 40%.
- A visited card's border takes the colour of its last closed outcome. Its subtitle counts visits above one (`agent · 2 visits`). While a visit is open the subtitle adds ` · open` and the border's dashes march round it. `waiting={{ id: label }}` makes an open visit there read as that label, with a solid border.

With a run, `show` defaults to `"visited"`. ELK then lays out only the entry, the visited stations, the edges the run took and the stations they reach (`visitedPartOf`), so the graph stays small. A "Whole line" toggle brings in the rest, faded, and `show="all"` starts there. A station removed by an edit, or hidden by turning "Whole line" off, fades out over 300 ms.

## Origin

The package started as a copy of re-cinq/lore-security `apps/web-ui/src` at commit 4598c19791154a2ae6afffa65e8b26c0825140b6, with everything about a run stripped. The layout is no longer lore's.
