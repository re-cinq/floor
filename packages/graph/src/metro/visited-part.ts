// The part of a line a run walked: the stations it visited and the lines it took.
import type { AssemblyLineDefinition } from "../assembly-line-definition";
import { edgeKeyOf } from "./edge-key";
import { takenLinesOf, type Visit } from "./taken-lines";

/** The visited stations, the lines the run took and the stations those lines reach. A run always starts at the entry, so the entry counts as visited even when the run records no visit for it. */
export function visitedPartOf(
  definition: AssemblyLineDefinition,
  visits: readonly Visit[],
): AssemblyLineDefinition {
  const taken = takenLinesOf(
    definition,
    withEntryVisit(definition.entry, visits),
  );
  const edges = definition.edges.filter((edge) => taken.has(edgeKeyOf(edge)));
  const keptIds = new Set([
    definition.entry,
    ...visits.map((visit) => visit.nodeId),
    ...edges.map((edge) => edge.to),
  ]);

  return {
    ...definition,
    exit: keptIds.has(definition.exit) ? definition.exit : "",
    nodes: definition.nodes.filter((node) => keptIds.has(node.id)),
    edges,
  };
}

function withEntryVisit(
  entry: string,
  visits: readonly Visit[],
): readonly Visit[] {
  return visits.some((visit) => visit.nodeId === entry)
    ? visits
    : [{ nodeId: entry, iteration: 0, open: false }, ...visits];
}
