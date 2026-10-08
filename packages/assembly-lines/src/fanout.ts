// Fan-out and join over the single-cursor walk: a source node reports a list of items, its body node then runs once per item (a branch), and the walk goes on only when every branch has reported. The kernel keeps its one cursor by folding a finished region's branch visits into ONE visit of the body node, whose outcome is `success` when every branch succeeded and `failed` otherwise; budgets, routing and the join edge are then the ordinary ones.

import type { NodeVisit, Transition, WalkGraph } from "./transition.js";

type Fans = Pick<WalkGraph, "fans">;

/** One run of the body: the source visit that listed the items and the branch visits that followed it. */
export interface FanRegion {
  source: NodeVisit;
  /** How many branches the source asked for. */
  expected: number;
  branches: NodeVisit[];
  /** A visit that is not one of its branches came after it, so the walk has moved on. */
  closed: boolean;
}

export function isFanBody(graph: Fans, nodeId: string): boolean {
  return (graph.fans ?? []).some((fan) => fan.body === nodeId);
}

/** The regions in the history, oldest first. */
export function fanRegions(
  graph: Fans,
  visits: readonly NodeVisit[],
): FanRegion[] {
  const regions: FanRegion[] = [];

  for (const visit of visits) {
    place(graph, regions, visit);
  }

  return regions;
}

// One visit's place in the regions: it opens one, joins the open one as a branch, or closes it.
function place(graph: Fans, regions: FanRegion[], visit: NodeVisit): void {
  if (opensRegion(graph, visit)) {
    regions.push({
      source: visit,
      expected: visit.branches ?? 0,
      branches: [],
      closed: false,
    });

    return;
  }

  const open = regions.at(-1);

  if (open && isBranchOf(graph, open, visit)) {
    open.branches.push(visit);

    return;
  }

  if (open) {
    open.closed = true;
  }
}

function opensRegion(graph: Fans, visit: NodeVisit): boolean {
  return (
    visit.outcome === "success" &&
    visit.branches !== undefined &&
    fanOf(graph, visit.nodeId) !== undefined
  );
}

function isBranchOf(graph: Fans, region: FanRegion, visit: NodeVisit): boolean {
  return (
    !region.closed &&
    visit.branch !== undefined &&
    visit.nodeId === fanOf(graph, region.source.nodeId)?.body
  );
}

/** Starts the branches the newest region has not started yet, when it has started some: a crash between launches leaves this. */
export function relaunchMissing(
  graph: Fans,
  visits: readonly NodeVisit[],
): Transition | null {
  const region = fanRegions(graph, visits).at(-1);
  const first = region?.branches.at(0);
  const branches = region && !region.closed ? unstarted(region) : [];

  return first && branches.length > 0
    ? {
        kind: "launch-many",
        nodeId: first.nodeId,
        iteration: first.iteration,
        branches,
      }
    : null;
}

function unstarted(region: FanRegion): number[] {
  const started = new Set(region.branches.map((visit) => visit.branch));

  return range(region.expected).filter((index) => !started.has(index));
}

/** The branches of a region just opened: the source reported items and none has started. */
export function branchesToStart(
  graph: Fans,
  visits: readonly NodeVisit[],
): number[] {
  const region = fanRegions(graph, visits).at(-1);

  return region && region.branches.length === 0 && !region.closed
    ? range(region.expected)
    : [];
}

/** The history with every finished region's branch visits replaced by the one visit of the body the walk routes on. */
export function foldFans(
  graph: Fans,
  visits: readonly NodeVisit[],
): NodeVisit[] {
  const regions = fanRegions(graph, visits);

  return visits.reduce<NodeVisit[]>(
    (folded, visit) => [...folded, ...foldedAs(graph, regions, visit, folded)],
    [],
  );
}

function foldedAs(
  graph: Fans,
  regions: readonly FanRegion[],
  visit: NodeVisit,
  folded: readonly NodeVisit[],
): NodeVisit[] {
  const inside = regions.find((region) => region.branches.includes(visit));

  if (inside) {
    return visit === inside.branches[0] ? [joined(inside)] : [];
  }

  return [visit, ...emptyRegion(graph, regions, visit, folded)];
}

// A region that asked for no items has no branch to fold, but the walk still passes through the body once.
function emptyRegion(
  graph: Fans,
  regions: readonly FanRegion[],
  visit: NodeVisit,
  folded: readonly NodeVisit[],
): NodeVisit[] {
  const region = regions.find((candidate) => candidate.source === visit);
  const fan = fanOf(graph, visit.nodeId);

  if (!region || region.expected > 0 || !fan) {
    return [];
  }

  const earlier = folded.filter((prior) => prior.nodeId === fan.body);
  const highest = Math.max(0, ...earlier.map((prior) => prior.iteration));

  return [{ nodeId: fan.body, iteration: highest + 1, outcome: "success" }];
}

function joined(region: FanRegion): NodeVisit {
  const [first] = region.branches;
  const succeeded = region.branches.every(
    (visit) => visit.outcome === "success",
  );

  return {
    nodeId: first!.nodeId,
    iteration: first!.iteration,
    outcome: succeeded ? "success" : "failed",
  };
}

function range(count: number): number[] {
  return [...Array(count).keys()];
}

/** The step onto `state`'s node: one visit, or one per item when the node is the body of a fan-out the walk has just entered. */
export function launchOf(
  graph: Fans,
  visits: readonly NodeVisit[],
  state: { currentId: string; iteration: number },
): Transition {
  const branches = isFanBody(graph, state.currentId)
    ? branchesToStart(graph, visits)
    : [];

  return branches.length > 0
    ? {
        kind: "launch-many",
        nodeId: state.currentId,
        iteration: state.iteration,
        branches,
      }
    : { kind: "launch", nodeId: state.currentId, iteration: state.iteration };
}

function fanOf(graph: Fans, source: string) {
  return (graph.fans ?? []).find((fan) => fan.source === source);
}
