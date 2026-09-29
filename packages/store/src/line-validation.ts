// Pure: what makes a line body self-consistent, beyond its JSON shape — every problem, not the first.
import type { LineBody, LineNode } from "./types.js";

export interface KnownDefinitions {
  stations: Set<string>;
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

// From the entry, and from every node the line starts by a name of its own: a person or an outside system arrives there without an edge, and what it leads to is reached too.
function reachedFrom(line: LineBody): Set<string> {
  const goingOut = edgesByFrom(line);
  const startedByName = line.nodes.filter((node) => node.start);
  const entered = [line.entry, ...startedByName.map((node) => node.id)];
  const reached = new Set(entered);
  const pending = [...entered];

  while (pending.length > 0) {
    const arrivedAt = goingOut.get(pending.pop()!) ?? [];
    const fresh = arrivedAt.filter((to) => !reached.has(to));

    fresh.forEach((to) => reached.add(to));
    pending.push(...fresh);
  }

  return reached;
}

function edgesByFrom(line: LineBody): Map<string, string[]> {
  const goingOut = new Map<string, string[]>();

  for (const edge of line.edges) goingOut.set(edge.from, [...(goingOut.get(edge.from) ?? []), edge.to]);

  return goingOut;
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

function hasStation(node: LineNode): node is LineNode & { station: string } {
  return Boolean(node.station);
}

function bareStationOf(node: LineNode & { station: string }): string {
  const [name] = node.station.split("@");

  return name;
}
