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
  /** Outcomes leaving this node, listed if they all lead to same next step. */
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
  tone: ConnectorTone;
  /** The outcomes that take this hop, each with its iteration cap when it has one. */
  label: string;
  /** The node has other targets, so the outcome is what tells this hop from its siblings. */
  branching: boolean;
}

export interface VisibleGraph {
  nodes: readonly VisibleNode[];
  edges: readonly VisibleEdge[];
}

/** The nodes and connectors to draw: collapse same-target outcomes, branch different-target ones. */
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

/** One connector per distinct TARGET. Outcomes that lead to the same node collapse into a single neutral edge — drawing one arrow per verdict would suggest branching where the line does not actually fork; a target reached by exactly one outcome keeps that outcome's tone. */
function connectorsFor(
  from: string,
  outgoing: readonly DefinitionEdge[],
): VisibleEdge[] {
  const targets = [...new Set(outgoing.map((edge) => edge.to))];

  return targets.map((to) => {
    const hops = outgoing.filter((edge) => edge.to === to);

    return {
      from,
      to,
      tone: targets.length > 1 && hops.length === 1 ? outcomeTone(hops[0].on) : "neutral",
      label: hops.map(hopLabel).join(", "),
      branching: targets.length > 1,
    };
  });
}

function hopLabel({ on, iteration_max }: DefinitionEdge): string {
  return iteration_max === undefined ? on : `${on} (max ${iteration_max})`;
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
