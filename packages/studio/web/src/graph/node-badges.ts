// The small tags a node wears on its top edge: where the line starts and ends, a fan-out, an event from outside, a problem. Each says its meaning in words, so no colour has to be told apart.
import type { VisibleNode } from "./graph-view-model";

export type NodeBadgeKind = "entry" | "exit" | "fail" | "fanout" | "event" | "problem";

export interface NodeBadge {
  kind: NodeBadgeKind;
  label: string;
  description: string;
}

export function badgesOf(node: VisibleNode): NodeBadge[] {
  const badges: (NodeBadge | false | undefined)[] = [
    node.isEntry && { kind: "entry", label: "entry", description: "the line starts here" },
    node.isExit && { kind: "exit", label: "exit", description: "the line ends here" },
    node.isFail && { kind: "fail", label: "fail", description: "the line ends here as failed" },
    node.fanout && { kind: "fanout", label: "fan-out", description: `fans out over ${node.fanout.over} to ${node.fanout.to}` },
    node.outsideStart && { kind: "event", label: "event", description: `started by the outside event ${node.outsideStart}` },
    node.hasProblem && { kind: "problem", label: "problem", description: "has a problem" },
  ];

  return badges.filter((badge) => badge !== false && badge !== undefined);
}
