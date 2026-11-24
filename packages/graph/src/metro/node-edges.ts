// The edges entering and leaving one station of an assembly line definition.
import type { AssemblyLineDefinition, DefinitionEdge } from "../assembly-line-definition";

/** The edges of `definition` that start at `nodeId`, in declaration order. */
export function outgoingEdgesOf(definition: AssemblyLineDefinition, nodeId: string): DefinitionEdge[] {
  return definition.edges.filter((edge) => edge.from === nodeId);
}

/** The edges of `definition` that end at `nodeId`, in declaration order. */
export function incomingEdgesOf(definition: AssemblyLineDefinition, nodeId: string): DefinitionEdge[] {
  return definition.edges.filter((edge) => edge.to === nodeId);
}
