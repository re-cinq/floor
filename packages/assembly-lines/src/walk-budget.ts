// The edge budgets of a walk (retry and unattended): which edge hops are free, and when a revisited or budgeted edge has spent what the definition allowed it.

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
    chosen.iterationMax === undefined &&
    chosen.unattendedMax === undefined &&
    !accounting.visited.has(chosen.to)
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
  const unattended = (accounting.unattendedCounts.get(key) ?? 0) + 1;

  const spent = spentBudget(chosen, count, unattended);

  if (spent) {
    return budgetSpent(assemblyLine, visit, key, spent);
  }

  accounting.backEdgeCounts.set(key, count);
  accounting.unattendedCounts.set(key, unattended);

  return { nextId: chosen.to };
}

// A person acting grants every edge a fresh unattended budget; the retry budget keeps counting.
export function restartUnattendedBudgets(accounting: WalkAccounting): void {
  accounting.unattendedCounts.clear();
}

export function isTransition(
  outcome: Transition | { nextId: string },
): outcome is Transition {
  return "kind" in outcome;
}

interface SpentBudget {
  kind: string;
  size: number;
}

// Which of the edge's two budgets, if either, this take has gone past.
function spentBudget(
  chosen: WalkEdge,
  count: number,
  unattended: number,
): SpentBudget | null {
  if (chosen.iterationMax !== undefined && count > chosen.iterationMax) {
    return { kind: "retry", size: chosen.iterationMax };
  }

  if (chosen.unattendedMax !== undefined && unattended > chosen.unattendedMax) {
    return { kind: "unattended", size: chosen.unattendedMax };
  }

  return null;
}

// One of this edge's budgets is gone. The budget is HOW the run ended; the visit's own error (if any) is left for the caller to attach, since this kernel carries no failure detail of its own.
function budgetSpent(
  assemblyLine: WalkGraph,
  visit: NodeVisit,
  key: string,
  spent: SpentBudget,
): Transition {
  return {
    kind: "halt",
    outcome: "iteration_max",
    reason: `AssemblyLine ${assemblyLine.name}: node "${visit.nodeId}" failed — the ${key} ${spent.kind} budget (${spent.size}) is spent`,
  };
}
