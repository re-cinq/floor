// The stations and edges connected to one station, in either direction.
import type { AssemblyLineDefinition, DefinitionEdge } from "../assembly-line-definition";
import { declaredIdsOf } from "./declared-ids";
import { edgeKeyOf } from "./edge-key";
import { incomingEdgesOf, outgoingEdgesOf } from "./node-edges";

export interface Neighbourhood {
  nodes: ReadonlySet<string>;
  edges: ReadonlySet<string>;
}

type EdgesAt = (definition: AssemblyLineDefinition, nodeId: string) => DefinitionEdge[];

/** `nodeId`, everything reachable from it, everything that reaches it, and the edges between them. */
export function neighbourhoodOf(definition: AssemblyLineDefinition, nodeId: string): Neighbourhood {
  if (!declaredIdsOf(definition).has(nodeId)) return { nodes: new Set(), edges: new Set() };

  const nodes = new Set([
    ...walk(definition, nodeId, outgoingEdgesOf, (edge) => edge.to),
    ...walk(definition, nodeId, incomingEdgesOf, (edge) => edge.from),
  ]);

  return { nodes, edges: new Set(edgeKeysWithin(definition.edges, nodes)) };
}

function edgeKeysWithin(edges: DefinitionEdge[], nodes: ReadonlySet<string>): string[] {
  return edges.filter((edge) => nodes.has(edge.from) && nodes.has(edge.to)).map(edgeKeyOf);
}

function walk(
  definition: AssemblyLineDefinition,
  startId: string,
  edgesAt: EdgesAt,
  nextOf: (edge: DefinitionEdge) => string,
): Set<string> {
  const visited = new Set<string>([startId]);
  const pending = [startId];

  while (pending.length > 0) {
    const reached = edgesAt(definition, pending.pop() as string).map(nextOf);
    const unseen = reached.filter((id) => !visited.has(id));

    unseen.forEach((id) => visited.add(id));
    pending.push(...new Set(unseen));
  }

  return visited;
}
