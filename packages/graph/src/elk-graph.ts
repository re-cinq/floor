// The input graph ELK lays out for a line.
import type { ElkLabel, ElkNode } from "elkjs/lib/elk-api";
import type { AssemblyLineDefinition, DefinitionEdge } from "./assembly-line-definition";
import { edgeKeyOf } from "./metro/edge-key";

const NODE_SIZE = { width: 140, height: 60 };
const LABEL_HEIGHT = 16;
const LABEL_CHAR_WIDTH = 7.3;
const LABEL_PADDING = 6;

const LAYOUT_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
};

/** Builds the ELK input graph for a line: one 140x60 child per node. */
export function elkGraphOf(definition: AssemblyLineDefinition): ElkNode {
  return {
    id: "root",
    layoutOptions: LAYOUT_OPTIONS,
    children: definition.nodes.map((node) => ({ id: node.id, ...NODE_SIZE })),
    edges: definition.edges.map((edge) => ({
      id: edgeKeyOf(edge),
      sources: [edge.from],
      targets: [edge.to],
      labels: [edgeLabelOf(edge)],
    })),
  };
}

function edgeLabelOf({ on, iterationMax }: DefinitionEdge): ElkLabel {
  const text = iterationMax === undefined ? on : `${on} · max ${iterationMax}`;

  return {
    text,
    width: Math.ceil(text.length * LABEL_CHAR_WIDTH + LABEL_PADDING),
    height: LABEL_HEIGHT,
  };
}
