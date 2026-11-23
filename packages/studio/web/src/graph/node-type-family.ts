// The family a node's kind belongs to, which the graph shows as a glyph and a stripe (run-viz FR4.1h). Outcome keeps the edge colour, so kind needs a channel of its own.
import type { DefinitionNodeType } from "./assembly-line-definition";

export type NodeTypeFamily = "agent" | "service" | "person" | "marker";

/** A family as the legend and a node's tooltip name it. */
export const FAMILY_LABEL: Record<NodeTypeFamily, string> = {
  agent: "Agent",
  service: "Service",
  person: "Human",
  marker: "Marker",
};

const FAMILY_OF_TYPE: Record<DefinitionNodeType, NodeTypeFamily> = {
  agent: "agent",
  service: "service",
  human: "person",
  marker: "marker",
};

/** agent: an AI pod runs it. person: it waits on someone. marker: a point in the line with no work of its own. service: run by a machine. */
export function typeFamilyOf(nodeType: DefinitionNodeType | undefined): NodeTypeFamily {
  return nodeType === undefined ? "marker" : FAMILY_OF_TYPE[nodeType];
}
