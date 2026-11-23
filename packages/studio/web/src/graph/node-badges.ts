// The small tags a node wears on its top edge: where the line starts and ends, a fan-out, an event from outside, a problem. Each says its meaning in words, so no colour has to be told apart.
import type { VisibleNode } from "./graph-view-model";

export type NodeBadgeKind = "entry" | "exit" | "fail" | "fanout" | "event" | "problem";

export interface NodeBadge {
  kind: NodeBadgeKind;
  label: string;
  description: string;
}

export function badgesOf(node: VisibleNode): NodeBadge[] {
  return [...rolesOf(node), ...factsOf(node)];
}

function rolesOf(node: VisibleNode): NodeBadge[] {
  const roles: (NodeBadge | undefined)[] = [
    node.isEntry ? { kind: "entry", label: "entry", description: "the line starts here" } : undefined,
    node.isExit ? { kind: "exit", label: "exit", description: "the line ends here" } : undefined,
    node.isFail ? { kind: "fail", label: "fail", description: "the line ends here as failed" } : undefined,
  ];

  return roles.filter((badge) => badge !== undefined);
}

function factsOf(node: VisibleNode): NodeBadge[] {
  const facts: (NodeBadge | undefined)[] = [
    node.fanout ? { kind: "fanout", label: "fan-out", description: `fans out over ${node.fanout.over} to ${node.fanout.to}` } : undefined,
    node.outsideStart ? { kind: "event", label: "event", description: `started by the outside event ${node.outsideStart}` } : undefined,
    node.hasProblem ? { kind: "problem", label: "problem", description: "has a problem" } : undefined,
  ];

  return facts.filter((badge) => badge !== undefined);
}
