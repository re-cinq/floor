// Which lines of the metro map an assembly run took, counted from the stations it visited.
import type { AssemblyLineDefinition, DefinitionEdge } from "../assembly-line-definition";
import { edgeKeyOf } from "./edge-key";
import { outgoingEdgesOf } from "./node-edges";

/** One station run, as `docs/assembly_run_storage.md`, "The rows", describes it. */
export interface Visit {
  nodeId: string;
  iteration: number;
  outcome?: string;
  open: boolean;
}

/** Lore's rule, first match wins: an edge whose `on` equals the outcome, then one whose `on` is a `-<on>` suffix of it, then the `always` edge. */
export function edgeTakenBy(
  outgoing: readonly DefinitionEdge[],
  outcome: string | undefined,
): DefinitionEdge | undefined {
  return (
    outgoing.find((edge) => edge.on === outcome) ??
    outgoing.find((edge) => edge.on && outcome?.endsWith(`-${edge.on}`)) ??
    outgoing.find((edge) => edge.on === "always")
  );
}

/** Maps an `edgeKeyOf` key to how often a run took that edge. */
export function takenLinesOf(
  definition: AssemblyLineDefinition,
  visits: readonly Visit[],
): ReadonlyMap<string, number> {
  return visits
    .filter((visit) => !visit.open)
    .map((visit) => edgeTakenBy(outgoingEdgesOf(definition, visit.nodeId), visit.outcome))
    .filter((edge): edge is DefinitionEdge => edge !== undefined)
    .reduce((taken, edge) => {
      const key = edgeKeyOf(edge);

      return taken.set(key, (taken.get(key) ?? 0) + 1);
    }, new Map<string, number>());
}
