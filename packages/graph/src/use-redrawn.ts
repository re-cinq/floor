// Tells the viewport each new size of the drawing, so it can fit the new drawing.
import { useEffect, type Dispatch } from "react";
import type { Size } from "./viewport";
import type { ViewportAction } from "./viewport-state";

export function useRedrawn({ width, height }: Size, dispatch: Dispatch<ViewportAction>): void {
  useEffect(() => {
    dispatch({ type: "redrawn", drawing: { width, height } });
  }, [width, height, dispatch]);
}
