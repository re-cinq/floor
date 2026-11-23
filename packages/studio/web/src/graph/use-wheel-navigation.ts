// Turns wheel turns on the viewport box into pan and zoom actions, keeping the page from scrolling.
import { useEffect, type Dispatch, type RefObject } from "react";
import { wheelAction } from "./viewport-input";
import type { ViewportAction } from "./viewport-state";

export function useWheelNavigation(boxRef: RefObject<SVGSVGElement | null>, dispatch: Dispatch<ViewportAction>) {
  useEffect(() => {
    const box = boxRef.current;

    if (!box) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      dispatch(wheelAction(event, box.getBoundingClientRect()));
    };

    // Not React's onWheel: that one is passive, so preventDefault could never stop the page scrolling.
    box.addEventListener("wheel", onWheel, { passive: false });

    return () => box.removeEventListener("wheel", onWheel);
  }, [boxRef, dispatch]);
}
