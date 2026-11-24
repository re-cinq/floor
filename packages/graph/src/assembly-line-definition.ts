// The shape of a line as the graph draws it. `graphOf` maps a line of the collection view onto it. It mirrored lore's run-page type; what only a run or lore's own stations had is gone.
import type { StationKind } from "@re-cinq/floor-contracts";

/** A node whose line names no station is a marker. */
export type DefinitionNodeKind = StationKind | "marker";

export interface DefinitionNode {
  id: string;
  type: DefinitionNodeKind;
  station?: string;
  description?: string;
  /** This node reports a list and `to` then runs once per item. */
  fanout?: { over: string; to: string };
  /** The event that starts the node from outside the line's own walk. */
  outsideStart?: string;
  hasProblem?: boolean;
}

export interface DefinitionEdge {
  from: string;
  to: string;
  /** The outcome that takes this edge. */
  on: string;
  iterationMax?: number;
  unattendedMax?: number;
}

export interface AssemblyLineDefinition {
  name: string;
  description: string;
  version: 1;
  entry: string;
  exit: string;
  /** The node that ends the run as failed on purpose; absent when the line has none. */
  fail?: string;
  nodes: DefinitionNode[];
  edges: DefinitionEdge[];
}
