// How far the node inspector reaches up into the graph box, measured because only a browser knows the layout.
import { useLayoutEffect, useState, type RefObject } from "react";

export function useCoveredBelow(
  screenRef: RefObject<HTMLElement | null>,
  graphRef: RefObject<HTMLElement | null>,
  node: unknown,
): number {
  const [coveredBelow, setCoveredBelow] = useState(0);

  useLayoutEffect(() => {
    const measure = () => setCoveredBelow(coveredHeight(screenRef.current, graphRef.current));

    measure();
    window.addEventListener("resize", measure);

    return () => window.removeEventListener("resize", measure);
  }, [screenRef, graphRef, node]);

  return coveredBelow;
}

// The sheet sits on the screen's bottom edge; its laid-out height, not its drawn box, says where it settles, so the slide-in animation does not fool the measure.
function coveredHeight(screen: HTMLElement | null, graph: HTMLElement | null): number {
  const sheet = screen?.querySelector("aside");

  if (!screen || !graph || !(sheet instanceof HTMLElement)) return 0;

  const sheetTop = screen.getBoundingClientRect().bottom - sheet.offsetHeight;

  return Math.max(0, graph.getBoundingClientRect().bottom - sheetTop);
}
