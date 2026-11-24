import type { LineEdge } from "@re-cinq/floor-contracts";
import { edgeKeyOf } from "@re-cinq/floor-graph";
import type { CollectionView, LineView, NodeView } from "@protocol";
import type { Selection } from "@/socket/fragment";

export interface ResolvedSelection {
  line: LineView | undefined;
  node: NodeView | undefined;
  edge: LineEdge | undefined;
}

/** What the URL names, as far as the collection still has it: a push that removes a line or a node leaves the rest of the selection standing. */
export function resolveSelection(collection: CollectionView | null, selection: Selection): ResolvedSelection {
  const line = collection?.lines.find(({ id }) => id === selection.line);
  const edge = line?.edges.find((candidate) => edgeKeyOf(candidate) === selection.edge);
  const node = edge ? undefined : line?.nodes.find(({ id }) => id === selection.node);

  return { line, node, edge };
}
