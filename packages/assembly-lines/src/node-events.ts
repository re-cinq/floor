// Pure: the events a node is started by, answered by and raises, for a tool that draws a line. It reads the same rules the dispatcher walks: a node's start event, a station's outcomes and the edge `selectEdge` takes for each.
import { DISPATCH_EVENT, REPORTED_EVENT, RUN_SETTLED_EVENT } from "./event-names.js";
import { hasStation, resolvedStationOf } from "./line-stations.js";
import { startEventName } from "./start-events.js";
import { isTerminalNode, selectEdge } from "./transition.js";
import type { LineBody, LineNode, StationBody, WhenValue } from "@re-cinq/floor-contracts";

export interface CollectionLine {
  id: string;
  body: LineBody;
}

/** `walk`: an edge leads here. `outside`: the node names its own start event. `line-start`: the line's own start raises it. `none`: nothing does. */
export type StartOrigin = "walk" | "outside" | "line-start" | "none";

export interface StartedBy {
  event: string;
  origin: StartOrigin;
  when?: Record<string, WhenValue>;
}

export interface AnsweredBy {
  event: string;
  when?: Record<string, WhenValue>;
  outcome: string;
}

export interface OutcomeTarget {
  /** The edge's `on`: the outcome itself, or `always`. */
  on: string;
  node: string;
  event: string;
}

export type Raised =
  | { kind: "event"; event: string }
  | { kind: "outcome"; outcome: string; leadsTo: OutcomeTarget | null }
  | { kind: "starts-line"; line: string; when?: Record<string, WhenValue> };

export interface NodeEvents {
  startedBy: StartedBy[];
  answeredBy: AnsweredBy[];
  raises: Raised[];
}

export function nodeEvents(line: LineBody, node: LineNode, lines: readonly CollectionLine[], bodies: ReadonlyMap<string, StationBody>): NodeEvents {
  return {
    startedBy: startedByOf(line, node),
    answeredBy: (node.reports ?? []).map(({ on, when, outcome }) => ({ event: on, ...(when && { when }), outcome })),
    raises: raisesOf(line, node, lines, bodies),
  };
}

function startedByOf(line: LineBody, node: LineNode): StartedBy[] {
  const own: StartedBy = { event: startEventName(node), origin: originOf(line, node) };
  const entryEvents = node.id === line.entry ? (line.start?.on ?? []) : [];
  const fromLineStart = entryEvents.map((event): StartedBy => ({ event, origin: "line-start", ...(line.start?.when && { when: line.start.when }) }));

  return [own, ...fromLineStart];
}

function originOf(line: LineBody, node: LineNode): StartOrigin {
  if (node.start) return "outside";
  if (line.edges.some((edge) => edge.to === node.id)) return "walk";

  return node.id === line.entry ? "line-start" : "none";
}

function raisesOf(line: LineBody, node: LineNode, lines: readonly CollectionLine[], bodies: ReadonlyMap<string, StationBody>): Raised[] {
  if (isTerminalNode(line, node.id)) return settledBy(lines);
  const station = hasStation(node) ? resolvedStationOf(node, bodies) : undefined;
  const stationEvents = hasStation(node) ? reportedEvents(station) : [];

  return [...stationEvents, ...outcomesOf(line, node, station)];
}

function settledBy(lines: readonly CollectionLine[]): Raised[] {
  const waiting = lines.filter(({ body }) => startsOn(body, RUN_SETTLED_EVENT));
  const started = waiting.map(({ id, body }): Raised => ({ kind: "starts-line", line: id, ...(body.start?.when && { when: body.start.when }) }));

  return [{ kind: "event", event: RUN_SETTLED_EVENT }, ...started];
}

function startsOn(line: LineBody, eventName: string): boolean {
  const events = line.start?.on ?? [];

  return events.includes(eventName);
}

function reportedEvents(station: StationBody | undefined): Raised[] {
  const dispatched = station?.kind === "agent" || station?.kind === "service";
  const dispatch: Raised[] = dispatched ? [{ kind: "event", event: DISPATCH_EVENT }] : [];

  return [...dispatch, { kind: "event", event: REPORTED_EVENT }];
}

// A marker reports success the moment it opens, so that is the one outcome it can take an edge on.
function outcomesOf(line: LineBody, node: LineNode, station: StationBody | undefined): Raised[] {
  const outcomes = hasStation(node) ? (station?.outcomes ?? []) : ["success"];

  return outcomes.map((outcome) => ({ kind: "outcome", outcome, leadsTo: targetOf(line, node.id, outcome) }));
}

function targetOf(line: LineBody, nodeId: string, outcome: string): OutcomeTarget | null {
  const edge = selectEdge({ name: "", ...line }, nodeId, outcome);
  const next = line.nodes.find((candidate) => candidate.id === edge?.to);

  return edge && next ? { on: edge.on, node: next.id, event: startEventName(next) } : null;
}
