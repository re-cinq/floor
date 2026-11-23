// The node read aloud: whatever its box shows, in words.
import type { VisibleNode } from "./graph-view-model";
import { badgesOf } from "./node-badges";
import { FAMILY_LABEL, typeFamilyOf } from "./node-type-family";

export function nodeAriaLabel(node: VisibleNode, isTerminal: boolean): string {
  const family = FAMILY_LABEL[typeFamilyOf(node.type)].toLowerCase();
  const badges = badgesOf(node).map(({ description }) => description);
  const outcomes = node.outcomes.length > 0 ? [`outcomes: ${node.outcomes.join(", ")}`] : [];
  const terminal = isTerminal ? ["terminal"] : [];

  return [node.id, family, ...badges, ...outcomes, ...terminal].join(", ");
}
