// Pure: what makes a line body self-consistent, beyond its JSON shape — every problem, not the first.
import { goingOutOf, reachableAvoiding, reachedFrom } from "./line-graph.js";
import { needChecks } from "./line-needs.js";
import { bareStationOf, hasStation, isPinned, resolvedStationOf } from "./line-stations.js";
import type { LineBody, LineNode, StationBody } from "./types.js";

export interface KnownDefinitions {
  stations: Set<string>;
  bodies?: ReadonlyMap<string, StationBody>;
}

export function validateLine(line: LineBody, known: KnownDefinitions): string[] {
  return [
    ...nodeNameChecks(line),
    ...uniqueNodeIdChecks(line),
    ...outgoingEdgeChecks(line),
    ...reachabilityChecks(line),
    ...startArgChecks(line),
    ...subjectArgChecks(line),
    ...stationChecks(line, known),
    ...reportChecks(line),
    ...outcomeEdgeChecks(line, known),
    ...cycleChecks(line, known),
    ...needChecks(line, known.bodies),
  ];
}

function nodeNameChecks(line: LineBody): string[] {
  const ids = nodeIds(line);
  const problems: string[] = [];

  if (!ids.has(line.entry)) problems.push(`entry "${line.entry}" is not a node`);
  if (!ids.has(line.exit)) problems.push(`exit "${line.exit}" is not a node`);

  line.edges.forEach((edge, index) => {
    if (!ids.has(edge.from)) problems.push(`edge ${index}: from "${edge.from}" is not a node`);
    if (!ids.has(edge.to)) problems.push(`edge ${index}: to "${edge.to}" is not a node`);
  });

  return problems;
}

function nodeIds(line: LineBody): Set<string> {
  return new Set(line.nodes.map((node) => node.id));
}

function uniqueNodeIdChecks(line: LineBody): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const node of line.nodes) {
    if (seen.has(node.id)) duplicates.add(node.id);
    seen.add(node.id);
  }

  return [...duplicates].map((id) => `node id "${id}" is used more than once`);
}

function outgoingEdgeChecks(line: LineBody): string[] {
  const problems: string[] = [];
  const sourcesWithEdge = new Set<string>();

  line.edges.forEach((edge, index) => {
    if (edge.from === line.exit) problems.push(`edge ${index}: exit "${line.exit}" cannot have an outgoing edge`);
    sourcesWithEdge.add(edge.from);
  });

  for (const node of line.nodes) {
    if (node.id !== line.exit && !sourcesWithEdge.has(node.id)) problems.push(`node "${node.id}" has no outgoing edge`);
  }

  return problems;
}

// A node the walk can never arrive at is dead weight the walk would never report on; a back edge still counts as arriving. Silent when the entry is not a node at all, which nodeNameChecks already says.
function reachabilityChecks(line: LineBody): string[] {
  const ids = nodeIds(line);

  if (!ids.has(line.entry)) return [];
  const reached = reachedFrom(line);
  const stranded = line.nodes.filter((node) => !reached.has(node.id));

  return stranded.map((node) => `node "${node.id}" is not reachable from entry "${line.entry}"`);
}

function startArgChecks(line: LineBody): string[] {
  const declared = new Set(Object.keys(line.args));

  return Object.keys(line.start?.args ?? {})
    .filter((name) => !declared.has(name))
    .map((name) => `start.args names "${name}", which is not a declared argument`);
}

function subjectArgChecks(line: LineBody): string[] {
  const subjectCount = Object.values(line.args).filter((spec) => spec.subject).length;

  return subjectCount > 1 ? ["more than one argument is marked subject"] : [];
}

function stationChecks(line: LineBody, known: KnownDefinitions): string[] {
  const stationNodes = line.nodes.filter(hasStation);

  return stationNodes.flatMap((node) => {
    const bareStation = bareStationOf(node);

    return known.stations.has(bareStation) ? [] : [`node "${node.id}" names unknown station "${bareStation}"`];
  });
}

// A marker reports success the moment it opens, so an event has nothing of its to answer.
function reportChecks(line: LineBody): string[] {
  const markersWithReports = line.nodes.filter((node) => !node.station && (node.reports ?? []).length > 0);

  return markersWithReports.map((node) => `node "${node.id}" declares reports but names no station to wait at`);
}

// Every outcome a reachable, resolvable station declares needs a way out: an exact edge, or an `always` that catches whatever has none. Pinned and unknown stations are opaque here — stationChecks already says when a name resolves nowhere at all.
function outcomeEdgeChecks(line: LineBody, known: KnownDefinitions): string[] {
  const bodies = known.bodies;

  if (!bodies) return [];
  const reached = reachedFrom(line);
  const stationNodes = line.nodes.filter(hasStation);
  const checkedNodes = stationNodes.filter((node) => node.id !== line.exit && reached.has(node.id));

  return checkedNodes.flatMap((node) => outcomesMissingEdges(line, node, bodies));
}

function outcomesMissingEdges(line: LineBody, node: LineNode & { station: string }, bodies: ReadonlyMap<string, StationBody>): string[] {
  const body = resolvedStationOf(node, bodies);

  if (!body) return [];
  const fromNode = line.edges.filter((edge) => edge.from === node.id);

  if (fromNode.some((edge) => edge.on === "always")) return [];
  const covered = new Set(fromNode.map((edge) => edge.on));
  const missing = body.outcomes.filter((outcome) => !covered.has(outcome));

  return missing.map((outcome) => `node "${node.id}" has no edge for outcome "${outcome}"`);
}

// A cycle is safe when something can stop it going round forever: a spent iteration_max, or a human deciding whether to send it round again. Everything else survives the prune below, and a node still reaching itself there is an unguarded cycle. Only a station node can be flagged as part of one — a marker does no work of its own to retry, though it still carries the walk through when it sits between two stations that do.
function cycleChecks(line: LineBody, known: KnownDefinitions): string[] {
  const unbudgeted = goingOutOf(line.edges.filter((edge) => edge.iterationMax === undefined));
  const guardNodes = line.nodes.filter((node) => isCycleGuard(node, known.bodies));
  const guards = new Set(guardNodes.map((node) => node.id));
  const stationNodes = line.nodes.filter((node) => hasStation(node) && !guards.has(node.id));
  const candidates = stationNodes.map((node) => node.id);
  const groups = groupCyclicNodes(unbudgeted, guards, candidates);

  return groups.map(cycleMessage);
}

function isCycleGuard(node: LineNode, bodies: ReadonlyMap<string, StationBody> | undefined): boolean {
  if (!hasStation(node)) return false;
  if (isPinned(node)) return true;
  if (!bodies) return false;
  const body = bodies.get(bareStationOf(node));

  return !body || body.kind === "human";
}

// Which candidates can walk back to themselves through the pruned graph, grouped so a cycle of several nodes is reported once, not once per member.
function groupCyclicNodes(unbudgeted: Map<string, string[]>, guards: Set<string>, candidates: string[]): string[][] {
  const reachesFromNeighbors = new Map(candidates.map((id) => [id, reachableAvoiding(unbudgeted, unbudgeted.get(id) ?? [], guards)]));
  const cyclic = candidates.filter((id) => reachesFromNeighbors.get(id)!.has(id));
  const seen = new Set<string>();
  const groups: string[][] = [];

  for (const id of cyclic) {
    if (seen.has(id)) continue;
    const group = cyclic.filter((other) => other === id || (reachesFromNeighbors.get(id)!.has(other) && reachesFromNeighbors.get(other)!.has(id)));

    group.forEach((member) => seen.add(member));
    groups.push(group);
  }

  return groups;
}

function cycleMessage(members: string[]): string {
  const names = members.map((id) => `"${id}"`).join(", ");

  return `cycle through ${names} has no iteration_max and no human node`;
}
