// Whether a station only relays the line onward and so needs no stop of its own on the metro map.
import type { AssemblyLineDefinition } from "../assembly-line-definition";
import { incomingEdgesOf, outgoingEdgesOf } from "./node-edges";

/** True when the station `nodeId` of `definition` is a pass-through. */
export function isPassThrough(definition: AssemblyLineDefinition, nodeId: string): boolean {
  return isRelayingNode(definition, nodeId) && hasRelayingEdges(definition, nodeId);
}

function isRelayingNode(definition: AssemblyLineDefinition, nodeId: string): boolean {
  const declaredNode = definition.nodes.find((node) => node.id === nodeId);
  const isStartedFromOutside = declaredNode?.outsideStart !== undefined;

  return declaredNode !== undefined && nodeId !== definition.entry && !isStartedFromOutside;
}

function hasRelayingEdges(definition: AssemblyLineDefinition, nodeId: string): boolean {
  const outgoing = outgoingEdgesOf(definition, nodeId);
  const hasSingleAlwaysEdgeOut = outgoing.length === 1 && outgoing[0].on === "always";

  return incomingEdgesOf(definition, nodeId).length === 1 && hasSingleAlwaysEdgeOut;
}
