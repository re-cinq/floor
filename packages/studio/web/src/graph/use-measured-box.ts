// Tells the viewport each new size of the element it draws into, so it can fit the drawing to it.
import { useEffect, type Dispatch, type RefObject } from "react";
import { useElementSize } from "./use-element-size";
import type { ViewportAction } from "./viewport-state";

export function useMeasuredBox<T extends Element>(dispatch: Dispatch<ViewportAction>): RefObject<T | null> {
  const [ref, box] = useElementSize<T>();

  useEffect(() => {
    if (box) {
      dispatch({ type: "measured", box });
    }
  }, [box, dispatch]);

  return ref;
}
