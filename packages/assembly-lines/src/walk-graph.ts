// Pure: builds the routing kernel's WalkGraph from a line body, with each station's kind handed in.

import type { LineBody } from "@re-cinq/floor-contracts";
import type { StationKind, WalkGraph } from "./transition.js";

type KindLookup = (stationRef: string) => StationKind | undefined;

export function walkGraphOf(lineName: string, line: LineBody, kindOf: KindLookup): WalkGraph {
  const fans = line.nodes.flatMap((node) => (node.fanout ? [{ source: node.id, body: node.fanout.to }] : []));
  const nodes = line.nodes.map((node) => (node.station ? { id: node.id, kind: kindOf(node.station) } : { id: node.id }));

  return { name: lineName, entry: line.entry, exit: line.exit, fail: line.fail, edges: line.edges, fans, nodes };
}
