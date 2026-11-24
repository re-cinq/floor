// The ELK layout of one assembly line: null until ELK resolves it.
import { useEffect, useState } from "react";
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import { layoutWithElk, type ElkLayout } from "./elk-layout";

/** Lays out the definition with ELK, ignoring results from replaced or unmounted effects. */
export function useElkLayout(
  definition: AssemblyLineDefinition,
  size?: { width: number; height: number },
  layout: typeof layoutWithElk = layoutWithElk,
): ElkLayout | null {
  const [laidOut, setLaidOut] = useState<ElkLayout | null>(null);

  useEffect(() => {
    let isStale = false;
    void layout(definition, size).then((result) => {
      if (!isStale) setLaidOut(result);
    });

    return () => {
      isStale = true;
    };
  },[definition, size, layout]);

  return laidOut;
}
