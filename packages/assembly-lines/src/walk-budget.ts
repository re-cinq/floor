// The retry budget of a walk: which edge hops are free, and when a revisited or budgeted edge has spent what the definition allowed it.

import type {
  NodeVisit,
  Transition,
  WalkAccounting,
  WalkEdge,
  WalkGraph,
} from "./transition.js";

// A fresh forward hop with no budget just moves on — only a revisit or a budgeted edge needs the accounting below.
export function isUnbudgetedForwardHop(
  chosen: WalkEdge,
  accounting: WalkAccounting,
): boolean {
  return (
    chosen.iterationMax === undefined && !accounting.visited.has(chosen.to)
  );
}

// The budget decision for a revisited/budgeted edge: an exhausted budget halts with its own reason, otherwise the edge is spent and the walk advances to its target.
export function budgetOutcome(
  assemblyLine: WalkGraph,
  visit: NodeVisit,
  chosen: WalkEdge,
  accounting: WalkAccounting,
): Transition | { nextId: string } {
  const key = `${chosen.from}->${chosen.to}`;
  const count = (accounting.backEdgeCounts.get(key) ?? 0) + 1;

  if (chosen.iterationMax !== undefined && count > chosen.iterationMax) {
    return budgetSpent(assemblyLine, visit, chosen, key);
  }

  accounting.backEdgeCounts.set(key, count);

  return { nextId: chosen.to };
}

export function isTransition(
  outcome: Transition | { nextId: string },
): outcome is Transition {
  return "kind" in outcome;
}

// The retry budget for this edge is gone. The budget is HOW the run ended; the visit's own error (if any) is left for the caller to attach, since this kernel carries no failure detail of its own.
function budgetSpent(
  assemblyLine: WalkGraph,
  visit: NodeVisit,
  chosen: WalkEdge,
  key: string,
): Transition {
  return {
    kind: "halt",
    outcome: "iteration_max",
    reason: `AssemblyLine ${assemblyLine.name}: node "${visit.nodeId}" failed — the ${key} retry budget (${chosen.iterationMax}) is spent`,
  };
}
