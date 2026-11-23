// Tells the viewport each new area to bring into view, keyed by value so an equal fresh object is ignored.
import { useEffect, type Dispatch } from "react";
import type { Box } from "./dag-layout";
import type { ViewportAction } from "./viewport-state";

export function useRevealed(area: Box | undefined, dispatch: Dispatch<ViewportAction>): void {
  const areaKey = area === undefined ? undefined : JSON.stringify(area);
  useEffect(() => {
    if (areaKey === undefined) return;
    dispatch({ type: "revealed", area: JSON.parse(areaKey) as Box });
  }, [areaKey, dispatch]);
}
