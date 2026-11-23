// The ids of the stations an assembly line definition declares.
import type { AssemblyLineDefinition } from "../assembly-line-definition";

/** The ids of every node declared in `definition`. */
export function declaredIdsOf(definition: AssemblyLineDefinition): Set<string> {
  return new Set(definition.nodes.map((node) => node.id));
}
