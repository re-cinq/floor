// The ELK layout of one assembly line: null until ELK resolves it.
import { useEffect, useState } from "react";
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import type { ElkGraphOptions, NodeSize } from "./elk-graph";
import { layoutWithElk, type ElkLayout } from "./elk-layout";

/** Lays out the definition with ELK, ignoring results from replaced or unmounted effects. */
export function useElkLayout(
  definition: AssemblyLineDefinition,
  size?: NodeSize,
  layout: typeof layoutWithElk = layoutWithElk,
  options?: ElkGraphOptions,
): ElkLayout | null {
  const [laidOut, setLaidOut] = useState<ElkLayout | null>(null);

  useEffect(() => {
    let isStale = false;
    void layout(definition, size, options).then((result) => {
      if (!isStale) setLaidOut(result);
    });

    return () => {
      isStale = true;
    };
  },[definition, size, layout, options]);

  return laidOut;
}
