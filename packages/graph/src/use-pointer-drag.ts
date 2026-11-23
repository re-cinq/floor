// Turns pointer presses and moves on the viewport box into drag actions.
import { useRef, type Dispatch, type PointerEvent } from "react";
import { dragAction, type PointerPosition } from "./viewport-input";
import type { ViewportAction } from "./viewport-state";

export function usePointerDrag(dispatch: Dispatch<ViewportAction>) {
  const lastPointer = useRef<PointerPosition | null>(null);

  return {
    onPointerDown: (event: PointerEvent) => {
      lastPointer.current = { x: event.clientX, y: event.clientY };
    },
    onPointerMove: (event: PointerEvent) => {
      const pointer = { x: event.clientX, y: event.clientY };

      if (!lastPointer.current) {
        return;
      }

      dispatch(dragAction(lastPointer.current, pointer));
      lastPointer.current = pointer;
    },
    onPointerUp: () => {
      lastPointer.current = null;
    },
  };
}
