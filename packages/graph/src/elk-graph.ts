// The input graph ELK lays out for a line.
import type { ElkLabel, ElkNode, ElkPort } from "elkjs/lib/elk-api";
import type { AssemblyLineDefinition, DefinitionEdge } from "./assembly-line-definition";
import { declaredIdsOf } from "./metro/declared-ids";
import { edgeKeyOf } from "./metro/edge-key";
import { mainPathOf } from "./metro/main-path";
import { incomingEdgesOf, outgoingEdgesOf } from "./metro/node-edges";
import { typeFamilyOf } from "./node-type-family";

const NODE_SIZE = { width: 140, height: 60 };
// Card height keeps ELK from centring stations on a shorter marker, which made sub-16px turns.
const MARKER_SIZE = { width: 22, height: NODE_SIZE.height };
const PORT_SIZE = 8;
const EXIT_DOT_SIZE = 14;
const STUB_SIZE = 14;

interface StubEnd {
  idSuffix: string;
  direction: "in" | "out";
  side: "WEST" | "EAST";
}

const TARGET_STUB: StubEnd = { idSuffix: "stub", direction: "in", side: "WEST" };
const SOURCE_STUB: StubEnd = { idSuffix: "source-stub", direction: "out", side: "EAST" };
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
  "elk.spacing.nodeNode": "36",
  "elk.layered.spacing.nodeNodeBetweenLayers": "56",
  "elk.spacing.edgeEdge": "12",
  "elk.layered.spacing.edgeEdgeBetweenLayers": "12",
  "elk.spacing.edgeNode": "18",
  "elk.layered.spacing.edgeNodeBetweenLayers": "18",
  "elk.spacing.edgeLabel": "4",
  "elk.edgeLabels.placement": "CENTER",
};

/** Builds the ELK input graph for a line: one child per node, markers 22x22, others 140x60 unless sized. */
export interface NodeSize {
  width: number;
  height: number;
  /** A card's own width by node id; cards without one take `width`. */
  widthOf?: (nodeId: string) => number;
}

export function elkGraphOf(definition: AssemblyLineDefinition, size: NodeSize = NODE_SIZE): ElkNode {
  const exitDotEdges = exitDotEdgesOf(definition);

  return {
    id: "root",
    layoutOptions: LAYOUT_OPTIONS,
    children: [
      ...definition.nodes.map((node) => ({
        id: node.id,
        ...(typeFamilyOf(node.type) === "marker" ? MARKER_SIZE : { width: size.widthOf?.(node.id) ?? size.width, height: size.height }),
        layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
        ports: [
          ...incomingEdgesOf(definition, node.id)
            .filter((edge) => !exitDotEdges.includes(edge))
            .map((edge) => portOf(edge, "in", "WEST")),
          ...outgoingEdgesOf(definition, node.id).map((edge) => portOf(edge, "out", "EAST")),
        ],
      })),
      ...exitDotEdges.map(exitDotOf),
      ...undeclaredStubsOf(definition),
    ],
    edges: definition.edges.map((edge) => ({
      id: edgeKeyOf(edge),
      sources: [`${edgeKeyOf(edge)}:out`],
      targets: [`${edgeKeyOf(edge)}:in`],
      labels: [edgeLabelOf(edge)],
    })),
  };
}

function exitDotEdgesOf(definition: AssemblyLineDefinition): DefinitionEdge[] {
  const mainEdges = mainPathOf(definition).edges;

  return definition.edges.filter((edge) => edge.to === definition.exit && !mainEdges.has(edgeKeyOf(edge)));
}

function exitDotOf(edge: DefinitionEdge): ElkNode {
  return {
    id: `${edgeKeyOf(edge)}:exit`,
    width: EXIT_DOT_SIZE,
    height: EXIT_DOT_SIZE,
    layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
    ports: [portOf(edge, "in", "WEST")],
  };
}

function undeclaredStubsOf(definition: AssemblyLineDefinition): ElkNode[] {
  const declaredIds = declaredIdsOf(definition);
  const undeclaredTargetEdges = definition.edges.filter((edge) => !declaredIds.has(edge.to));
  const undeclaredSourceEdges = definition.edges.filter((edge) => !declaredIds.has(edge.from));

  return [
    ...undeclaredTargetEdges.map((edge) => stubOf(edge, TARGET_STUB)),
    ...undeclaredSourceEdges.map((edge) => stubOf(edge, SOURCE_STUB)),
  ];
}

function stubOf(edge: DefinitionEdge, { idSuffix, direction, side }: StubEnd): ElkNode {
  return {
    id: `${edgeKeyOf(edge)}:${idSuffix}`,
    width: STUB_SIZE,
    height: STUB_SIZE,
    layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
    ports: [portOf(edge, direction, side)],
  };
}

function portOf(edge: DefinitionEdge, direction: "in" | "out", side: "WEST" | "EAST"): ElkPort {
  return {
    id: `${edgeKeyOf(edge)}:${direction}`,
    width: PORT_SIZE,
    height: PORT_SIZE,
    layoutOptions: { "elk.port.side": side },
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
