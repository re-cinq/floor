// The walk kernel: a pure replay over persisted visits; ported from lore's transition.ts with two departures documented in README.md (dynamic outcomes, no failure classification).

export interface WalkEdge {
  from: string;
  to: string;
  on: string;
  iterationMax?: number;
}

export type StationKind = "agent" | "service" | "human";

export interface WalkGraph {
  name: string;
  entry: string;
  exit: string;
  /** A second terminal beside `exit`: a walk that arrives here ends the run as failed on purpose. */
  fail?: string;
  edges: readonly WalkEdge[];
  /** Node kind, so the node ceiling can tell a person's pass from a machine's; a run recorded without them counts every visit. `kind` absent = marker. */
  nodes?: readonly { id: string; kind?: StationKind }[];
}

/** One visit's (station run's) contribution to the walk state (outcome null = still open). */
export interface NodeVisit {
  nodeId: string;
  iteration: number;
  outcome: string | null;
  /** The person who opened this visit by hand (docs/assembly_run_storage.md, "reports from outside"); the walk restarts here, so what came before routes nothing and spends no budget. */
  requestedBy?: string | null;
}

export type Transition =
  | { kind: "launch"; nodeId: string; iteration: number }
  | { kind: "await" }
  | { kind: "finish" }
  | { kind: "halt"; outcome: "iteration_max" | "error" | "failed"; reason: string };

type EndingTransition = Extract<Transition, { kind: "finish" | "halt" }>;

export function endsRun(transition: Transition): transition is EndingTransition {
  return transition.kind === "finish" || transition.kind === "halt";
}

const DEFAULT_MAX_NODES = 200;

/** The exit and the fail node are both terminal: a walk that arrives at either stops there. */
export function isTerminalNode(
  assemblyLine: Pick<WalkGraph, "exit" | "fail">,
  nodeId: string,
): boolean {
  return nodeId === assemblyLine.exit || nodeId === assemblyLine.fail;
}

// The executor's edge rule: exact-outcome match preferred over `always`; null when nothing matches.
export function selectEdge(
  assemblyLine: WalkGraph,
  from: string,
  outcome: string,
): WalkEdge | null {
  const candidates = assemblyLine.edges.filter(
    (edge) => edge.from === from && (edge.on === outcome || edge.on === "always"),
  );

  return candidates.find((edge) => edge.on === outcome) ?? candidates.at(0) ?? null;
}

interface WalkState {
  currentId: string;
  iteration: number;
}

interface WalkAccounting {
  backEdgeCounts: Map<string, number>;
  // A revisit must number past every prior row for that node (not just this edge's count) — two back-edges into the same target could otherwise collide.
  highestIteration: Map<string, number>;
  visited: Set<string>;
}

// The two mutable halves of a replay, carried together: where the walk has got to, and what it has spent getting there. They are always passed as a pair because neither is meaningful without the other.
interface Walk {
  state: WalkState;
  accounting: WalkAccounting;
}

// Replay the visit history for what happens next (the sole routing definition): a revisited node bumps the iteration, and a budgeted edge additionally halts past its iterationMax.
export function getNextTransition(
  assemblyLine: WalkGraph,
  visits: NodeVisit[],
  maxNodes = DEFAULT_MAX_NODES,
): Transition {
  const blocked = replayBlocked(assemblyLine, visits, maxNodes);

  if (blocked) {
    return blocked;
  }

  const { state, failure } = replayFromLastHandRun(assemblyLine, visits);

  if (failure) {
    return failure;
  }

  // A visit is always on record here: only a visit's outcome can carry the walk onto fail, which validation refuses as the entry.
  if (state.currentId === assemblyLine.fail) {
    return deliberateFailure(assemblyLine, visits.at(-1));
  }

  return state.currentId === assemblyLine.exit
    ? { kind: "finish" }
    : { kind: "launch", nodeId: state.currentId, iteration: state.iteration };
}

// Why the replay cannot produce a next step. An unfinished visit means the answer is not knowable yet rather than wrong; the node ceiling means the definition is cycling and the walk would never reach exit.
function replayBlocked(
  assemblyLine: WalkGraph,
  visits: NodeVisit[],
  maxNodes: number,
): Transition | null {
  if (visits.some((visit) => visit.outcome === null)) {
    return { kind: "await" };
  }

  if (unattendedVisits(assemblyLine, visits) >= maxNodes) {
    return {
      kind: "halt",
      outcome: "error",
      reason: `AssemblyLine ${assemblyLine.name}: maxNodes (${maxNodes}) reached without hitting exit or a person acting`,
    };
  }

  return null;
}

// The ceiling guards a MACHINE loop that never ends, so it counts only the visits since a person last acted — the same exemption a human-gated back-edge gets from iterationMax.
function unattendedVisits(
  assemblyLine: WalkGraph,
  visits: readonly NodeVisit[],
): number {
  const human = new Set(
    (assemblyLine.nodes ?? [])
      .filter((node) => node.kind === "human")
      .map((node) => node.id),
  );

  return (
    visits.length -
    1 -
    visits.findLastIndex((visit) => human.has(visit.nodeId) || Boolean(visit.requestedBy))
  );
}

/** The visits the walk routes on: from the last one a person ran by hand, or all of them when nobody did. */
export function visitsSinceHandRun<T extends Pick<NodeVisit, "requestedBy">>(
  visits: readonly T[],
): T[] {
  return visits.slice(Math.max(0, lastHandRun(visits)));
}

// Where the walk got to, or the Transition that ended it — replayed from the last hand-run visit on.
function replayFromLastHandRun(
  assemblyLine: WalkGraph,
  visits: NodeVisit[],
): { state: WalkState; failure: Transition | null } {
  const { state, accounting } = walkFromLastHandRun(assemblyLine, visits);
  const since = visitsSinceHandRun(visits);

  return {
    state,
    failure: replayVisits(assemblyLine, since, state, accounting),
  };
}

// Starts where the person put the walk. The visits before still number the iterations after, or a revisit would collide with a row already recorded; their back-edges are not carried, because a person acting grants a fresh budget.
function walkFromLastHandRun(
  assemblyLine: WalkGraph,
  visits: readonly NodeVisit[],
): Walk {
  const walk = freshWalk(assemblyLine, visits);
  const index = lastHandRun(visits);

  if (index < 0) {
    return walk;
  }

  visits.slice(0, index).forEach((visit) => recordVisit(visit, walk.accounting));
  walk.state.currentId = visits[index]!.nodeId;
  walk.state.iteration = visits[index]!.iteration;

  return walk;
}

function lastHandRun(
  visits: readonly Pick<NodeVisit, "requestedBy">[],
): number {
  return visits.findLastIndex((visit) => visit.requestedBy);
}

// A walk that has not moved: on its first iteration, having spent nothing, at the node the run was started at. That is the node of its first visit — a start may name a node other than the line's entry — and the line's entry for a run with no visit yet. Every replay begins here — the history is what moves it, so nothing is carried over between calls.
function freshWalk(
  assemblyLine: WalkGraph,
  visits: readonly Pick<NodeVisit, "nodeId">[],
): Walk {
  return {
    state: { currentId: visits[0]?.nodeId ?? assemblyLine.entry, iteration: 1 },
    accounting: {
      backEdgeCounts: new Map(),
      highestIteration: new Map(),
      visited: new Set(),
    },
  };
}

function replayVisits(
  assemblyLine: WalkGraph,
  visits: NodeVisit[],
  state: WalkState,
  accounting: WalkAccounting,
): Transition | null {
  for (const visit of visits) {
    const failure = applyVisit(assemblyLine, visit, state, accounting);

    if (failure) {
      return failure;
    }
  }

  return null;
}

// One visit's contribution to the walk: mutates state/accounting toward the next node, or returns the Transition that ends the replay.
function applyVisit(
  assemblyLine: WalkGraph,
  visit: NodeVisit,
  state: WalkState,
  accounting: WalkAccounting,
): Transition | null {
  recordVisit(visit, accounting);
  const diverged = divergenceFailure(assemblyLine, visit, state);

  if (diverged) {
    return diverged;
  }

  const chosen = selectEdge(assemblyLine, visit.nodeId, visit.outcome!);

  if (!chosen) {
    return noEdgeFailure(assemblyLine, visit);
  }

  return followEdge(assemblyLine, visit, chosen, { state, accounting });
}

function recordVisit(visit: NodeVisit, accounting: WalkAccounting): void {
  accounting.visited.add(visit.nodeId);
  accounting.highestIteration.set(
    visit.nodeId,
    Math.max(
      accounting.highestIteration.get(visit.nodeId) ?? 0,
      visit.iteration,
    ),
  );
}

// Node id AND iteration must both match the recomputed walk, or a wrong-iteration row replays cleanly while a compare-and-set hits a different iteration's row (silent split-brain).
function divergenceFailure(
  assemblyLine: WalkGraph,
  visit: NodeVisit,
  state: WalkState,
): Transition | null {
  if (
    visit.nodeId === state.currentId &&
    visit.iteration === state.iteration
  ) {
    return null;
  }

  return {
    kind: "halt",
    outcome: "error",
    reason: `AssemblyLine ${assemblyLine.name}: node rows diverge from the definition (recorded "${visit.nodeId}" iter ${visit.iteration}, expected "${state.currentId}" iter ${state.iteration})`,
  };
}

function noEdgeFailure(assemblyLine: WalkGraph, visit: NodeVisit): Transition {
  return {
    kind: "halt",
    outcome: "error",
    reason: `AssemblyLine ${assemblyLine.name}: no edge from "${visit.nodeId}" for outcome "${visit.outcome}"`,
  };
}

// The line chose to end here: the reason names the visit whose outcome led to the fail node.
function deliberateFailure(assemblyLine: WalkGraph, visit: NodeVisit | undefined): Transition {
  const why = visit
    ? `node "${visit.nodeId}" reported "${visit.outcome}"`
    : `the walk began at the fail node "${assemblyLine.fail}"`;

  return { kind: "halt", outcome: "failed", reason: `AssemblyLine ${assemblyLine.name}: ${why}` };
}

// Moves the walk along `chosen`, or returns the Transition that ends it. A plain forward hop only sets the node; a revisit additionally bumps the iteration past the highest already recorded, which is what makes a second attempt distinguishable from the first.
function followEdge(
  assemblyLine: WalkGraph,
  visit: NodeVisit,
  chosen: WalkEdge,
  walk: Walk,
): Transition | null {
  const { state, accounting } = walk;

  if (isUnbudgetedForwardHop(chosen, accounting)) {
    state.currentId = chosen.to;

    return null;
  }

  const outcome = budgetOutcome(assemblyLine, visit, chosen, accounting);

  if (isTransition(outcome)) {
    return outcome;
  }

  state.iteration = (accounting.highestIteration.get(outcome.nextId) ?? 0) + 1;
  state.currentId = outcome.nextId;

  return null;
}

// A fresh forward hop with no budget just moves on — only a revisit or a budgeted edge needs the accounting below.
function isUnbudgetedForwardHop(
  chosen: WalkEdge,
  accounting: WalkAccounting,
): boolean {
  return (
    chosen.iterationMax === undefined && !accounting.visited.has(chosen.to)
  );
}

// The budget decision for a revisited/budgeted edge: an exhausted budget halts with its own reason, otherwise the edge is spent and the walk advances to its target.
function budgetOutcome(
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

function isTransition(
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
