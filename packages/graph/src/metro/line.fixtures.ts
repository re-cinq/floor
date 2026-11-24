// Builds a line of marker stations from just the parts a metro test varies.
import type { AssemblyLineDefinition } from "../assembly-line-definition";

/** An edge as `[from, to, on]`. */
export type EdgeShorthand = readonly [from: string, to: string, on: string];

export interface MarkerLineParts {
  entry: string;
  exit?: string;
  nodeIds: string[];
  edges: EdgeShorthand[];
  /** Stations started from outside the line, by station id. */
  outsideStarts?: Record<string, string>;
}

/** A definition whose every station is a marker; the exit defaults to `done`. */
export function markerLine({ entry, exit = "done", nodeIds, edges, outsideStarts = {} }: MarkerLineParts): AssemblyLineDefinition {
  return {
    name: "marker-line",
    description: "A line of markers.",
    version: 1,
    entry,
    exit,
    nodes: nodeIds.map((id) => ({ id, type: "marker", ...(id in outsideStarts && { outsideStart: outsideStarts[id] }) })),
    edges: edges.map(([from, to, on]) => ({ from, to, on })),
  };
}
