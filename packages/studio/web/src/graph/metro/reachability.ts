// Which stations the entry never reaches, and which edges point at a node that does not exist.
import type { AssemblyLineDefinition } from "../assembly-line-definition";
import { declaredIdsOf } from "./declared-ids";
import { edgeKeyOf } from "./edge-key";
import { outgoingEdgesOf } from "./node-edges";

/** Stations nothing leads to, and the `edgeKeyOf` keys of edges with an undeclared source or target. */
export interface Reachability {
  unreachable: ReadonlySet<string>;
  danglingEdges: ReadonlySet<string>;
}

/** Walks from the entry and every outside start; reports declared stations never reached and edges touching undeclared nodes. */
export function reachabilityOf(definition: AssemblyLineDefinition): Reachability {
  const reached = reachedFrom([definition.entry, ...outsideStartIdsOf(definition)], definition);
  const declaredIds = declaredIdsOf(definition);
  const unreachable = new Set([...declaredIds].filter((id) => !reached.has(id)));

  return { unreachable, danglingEdges: danglingEdgeKeysOf(definition, declaredIds) };
}

function outsideStartIdsOf(definition: AssemblyLineDefinition): string[] {
  const outsideStarted = definition.nodes.filter((node) => node.outsideStart);

  return outsideStarted.map((node) => node.id);
}

function danglingEdgeKeysOf(definition: AssemblyLineDefinition, declaredIds: ReadonlySet<string>): Set<string> {
  const dangling = definition.edges.filter((edge) => !declaredIds.has(edge.to) || !declaredIds.has(edge.from));

  return new Set(dangling.map(edgeKeyOf));
}

function reachedFrom(startIds: string[], definition: AssemblyLineDefinition): Set<string> {
  const reached = new Set(startIds);
  const frontier = [...startIds];

  for (const current of frontier) {
    const nextIds = outgoingEdgesOf(definition, current)
      .filter((edge) => !reached.has(edge.to))
      .map((edge) => edge.to);
    nextIds.forEach((id) => reached.add(id));
    frontier.push(...nextIds);
  }

  return reached;
}
