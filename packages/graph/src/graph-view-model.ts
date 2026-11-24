// Map a definition to drawable nodes and connectors.

import type {
  AssemblyLineDefinition,
  DefinitionEdge,
  DefinitionNode,
} from "./assembly-line-definition";

export type ConnectorTone = "ok" | "warn" | "err" | "neutral";

export interface VisibleNode {
  id: string;
  type: DefinitionNode["type"];
  /** Outcomes leaving this node, in definition order. */
  outcomes: readonly string[];
  isEntry: boolean;
  isExit: boolean;
  isFail: boolean;
  fanout?: DefinitionNode["fanout"];
  outsideStart?: string;
  hasProblem: boolean;
}

export interface VisibleEdge {
  from: string;
  to: string;
  /** The outcome that takes this hop. */
  on: string;
  tone: ConnectorTone;
  /** The outcome that takes this hop, with its iteration cap when it has one. */
  label: string;
  /** The node has other targets, so the outcome is what tells this hop from its siblings. */
  branching: boolean;
}

export interface VisibleGraph {
  nodes: readonly VisibleNode[];
  edges: readonly VisibleEdge[];
}

/** The nodes and connectors to draw: one connector per outcome. */
export function deriveVisibleGraph(
  definition: AssemblyLineDefinition | null,
): VisibleGraph {
  if (!definition) {
    return { nodes: [], edges: [] };
  }

  const outgoing = new Map(
    definition.nodes.map((node) => [
      node.id,
      definition.edges.filter((edge) => edge.from === node.id),
    ]),
  );

  return {
    nodes: definition.nodes.map((node) =>
      visibleNode(node, definition, outgoing.get(node.id) ?? []),
    ),
    edges: [...outgoing].flatMap(([from, edges]) => connectorsFor(from, edges)),
  };
}

/** Outcomes are listed on the SOURCE node, so a connector never repeats a verdict the node already states. */
function visibleNode(
  node: DefinitionNode,
  { entry, exit, fail }: AssemblyLineDefinition,
  outgoing: readonly DefinitionEdge[],
): VisibleNode {
  return {
    id: node.id,
    type: node.type,
    outcomes: outgoing.map((edge) => edge.on),
    isEntry: node.id === entry,
    isExit: node.id === exit,
    isFail: node.id === fail,
    fanout: node.fanout,
    outsideStart: node.outsideStart,
    hasProblem: node.hasProblem === true,
  };
}

/** One connector per definition edge, in definition order. The outcome sets the tone; a source with several distinct targets is branching. */
function connectorsFor(
  from: string,
  outgoing: readonly DefinitionEdge[],
): VisibleEdge[] {
  const branching = new Set(outgoing.map((edge) => edge.to)).size > 1;

  return outgoing.map((edge) => ({
    from,
    to: edge.to,
    on: edge.on,
    tone: outcomeTone(edge.on),
    label: hopLabel(edge),
    branching,
  }));
}

function hopLabel({ on, iterationMax }: DefinitionEdge): string {
  return iterationMax === undefined ? on : `${on} (max ${iterationMax})`;
}

/** Outcome (or edge condition) to a connector/badge tone. */
export function outcomeTone(outcome: string): ConnectorTone {
  if (outcome.includes("failed")) {
    return "err";
  }

  if (outcome === "changes_requested") {
    return "warn";
  }

  return outcome === "success" ? "ok" : "neutral";
}
