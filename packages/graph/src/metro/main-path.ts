// The stations and edges of the metro map's main line, from the entry towards the exit.
import type { AssemblyLineDefinition, DefinitionEdge } from "../assembly-line-definition";
import { declaredIdsOf } from "./declared-ids";
import { edgeKeyOf } from "./edge-key";
import { outgoingEdgesOf } from "./node-edges";

/** The station ids and `edgeKeyOf` keys that make up the main line. */
export interface MainPath {
  nodes: ReadonlySet<string>;
  edges: ReadonlySet<string>;
}

/** The stations and edges from the entry along `success`, or along `always` when nothing succeeds, until the exit, a repeat or a dead end. */
export function mainPathOf(definition: AssemblyLineDefinition): MainPath {
  const declaredIds = declaredIdsOf(definition);
  if (!declaredIds.has(definition.entry)) return { nodes: new Set(), edges: new Set() };

  const nodes = new Set<string>([definition.entry]);
  const edges = new Set<string>();
  let current = definition.entry;
  let next = forwardEdgeFrom(definition, current);

  const canStepTo = (edge: DefinitionEdge | undefined): edge is DefinitionEdge =>
    edge !== undefined && declaredIds.has(edge.to) && !nodes.has(edge.to);

  while (current !== definition.exit && canStepTo(next)) {
    edges.add(edgeKeyOf(next));
    nodes.add(next.to);
    current = next.to;
    next = forwardEdgeFrom(definition, current);
  }

  return { nodes, edges };
}

function forwardEdgeFrom(definition: AssemblyLineDefinition, nodeId: string): DefinitionEdge | undefined {
  const outgoing = outgoingEdgesOf(definition, nodeId);

  return outgoing.find((edge) => edge.on === "success") ?? outgoing.find((edge) => edge.on === "always");
}
