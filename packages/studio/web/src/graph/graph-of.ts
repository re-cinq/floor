// A line of the collection view as the definition the graph draws.
import type { LineView, NodeView } from "@protocol";
import type { StartedBy } from "@re-cinq/floor-assembly-lines";
import type { AssemblyLineDefinition, DefinitionNode } from "@re-cinq/floor-graph";

export function graphOf(line: LineView): AssemblyLineDefinition {
  const namedByProblems = new Set(line.problems.map(({ node }) => node));

  return {
    name: line.id,
    description: "",
    version: 1,
    entry: line.entry,
    exit: line.exit,
    fail: line.fail,
    nodes: line.nodes.map((node) => definitionNodeOf(node, namedByProblems)),
    edges: line.edges,
  };
}

function definitionNodeOf(node: NodeView, namedByProblems: ReadonlySet<string | undefined>): DefinitionNode {
  return {
    id: node.id,
    type: node.kind ?? "marker",
    station: node.station,
    description: node.description,
    fanout: node.fanout,
    outsideStart: outsideStartOf(node.events.startedBy),
    hasProblem: namedByProblems.has(node.id),
  };
}

function outsideStartOf(startedBy: readonly StartedBy[]): string | undefined {
  const outside = startedBy.find(({ origin }) => origin === "outside");

  return outside?.event;
}
