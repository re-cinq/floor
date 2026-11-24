import type { ElkLayout } from "./elk-layout";
import { edgeKeyOf } from "./metro/edge-key";
import type { VisibleGraph } from "./graph-view-model";
import { fitView } from "./run-graph-geometry";

export type Drawing = ReturnType<typeof drawingOf>;

/** Everything the drawing needs: ELK's layout, the viewport it fits, and the model lookups. */
export function drawingOf(layout: ElkLayout, graph: VisibleGraph, name: string, stops: ReadonlySet<string>) {
  return {
    layout,
    stops,
    view: fitView(layout.contentBox),
    titleId: `graph-title-${name}`,
    ...graphLookups(graph),
  };
}

/** The lookups that let the drawing match a laid-out node or edge back to its model. A node with no outgoing edge is terminal, which is read from the EDGES rather than from the node, because a definition does not mark its own ends. */
function graphLookups({ nodes, edges }: VisibleGraph) {
  return {
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    edgeByKey: new Map(edges.map((edge) => [edgeKeyOf(edge), edge])),
    toneByEdge: new Map(edges.map((edge) => [edgeKeyOf(edge), edge.tone])),
    nodesWithOutgoing: new Set(edges.map((edge) => edge.from)),
  };
}
