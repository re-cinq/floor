// A line of the collection view as the definition the graph draws.
import type { LineView, NodeView } from "@protocol";
import type { AssemblyLineDefinition, DefinitionEdge, DefinitionNode } from "./assembly-line-definition";

export function graphOf(line: LineView): AssemblyLineDefinition {
  const namedByProblems = new Set(line.problems.map(({ node }) => node));

  return {
    name: line.id,
    description: "",
    version: 1,
    entry: line.entry,
    exit: line.exit,
    fail: line.fail,
    nodes: line.nodes.map((node) => definitionNodeOf(node, namedByProblems.has(node.id))),
    edges: line.edges.map(({ from, to, on, iterationMax }): DefinitionEdge => ({ from, to, on, ...(iterationMax !== undefined && { iteration_max: iterationMax }) })),
  };
}

function definitionNodeOf(node: NodeView, hasProblem: boolean): DefinitionNode {
  return {
    id: node.id,
    type: node.kind ?? "marker",
    station: node.station,
    description: node.description,
    fanout: node.fanout,
    outsideStart: node.events.startedBy.find(({ origin }) => origin === "outside")?.event,
    hasProblem,
  };
}
