// Names the edge the floor would take from a node for an outcome.
import { isTerminalNode, selectEdge } from "@re-cinq/floor-assembly-lines";
import type { LineBody } from "@re-cinq/floor-contracts";

interface EdgeQuery {
  line: LineBody;
  node: string;
  outcome: string;
}

export function edgeTaken({ line, node, outcome }: EdgeQuery) {
  if (isTerminalNode(line, node)) return undefined;

  return selectEdge({ name: "", ...line }, node, outcome) ?? undefined;
}
