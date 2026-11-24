// The card size ELK lays out: each card as wide as the longer of its title and its run-aware subtitle.
import { useMemo } from "react";
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import type { StationVisits } from "./metro/station-visits";
import { nodeTitle } from "./node-tooltip";
import { typeFamilyOf } from "./node-type-family";
import { NODE_HEIGHT, NODE_WIDTH, cardWidthOf } from "./run-graph-geometry";
import { subtitleOf } from "./station-subtitle";

export function useNodeSize(
  definition: AssemblyLineDefinition,
  visits: ReadonlyMap<string, StationVisits> | undefined,
) {
  return useMemo(() => {
    const familyById = new Map(
      definition.nodes.map((node) => [node.id, typeFamilyOf(node.type)]),
    );

    return {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      widthOf: (nodeId: string) =>
        cardWidthOf(
          nodeTitle(nodeId),
          subtitleOf(familyById.get(nodeId) ?? "marker", visits?.get(nodeId)),
        ),
    };
  }, [definition, visits]);
}
