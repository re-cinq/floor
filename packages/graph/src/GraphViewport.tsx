// Shows the drawing inside an <svg ref={svgRef}> box through the viewport transform: fit on screen, zoom and pan.
import { useReducer, type ReactNode } from "react";
import type { Box } from "./elk-layout";
import { svgTransformOf, type Size } from "./viewport";
import { useMeasuredBox } from "./use-measured-box";
import { usePointerDrag } from "./use-pointer-drag";
import { useRedrawn } from "./use-redrawn";
import { useRevealed } from "./use-revealed";
import { useWheelNavigation } from "./use-wheel-navigation";
import ViewportControls from "./ViewportControls";
import styles from "./viewport.module.css";
import { keyAction } from "./viewport-input";
import { initialViewport, viewportReducer } from "./viewport-state";

export interface GraphViewportProps {
  drawing: Size;
  reveal?: Box;
  coveredBelow?: number;
  mainPathOn?: boolean;
  onToggleMainPath?: () => void;
  compactStopsOn?: boolean;
  onToggleCompactStops?: () => void;
  wholeLineOn?: boolean;
  onToggleWholeLine?: () => void;
  children: ReactNode;
}

export default function GraphViewport({ drawing, reveal, coveredBelow, mainPathOn, onToggleMainPath, compactStopsOn, onToggleCompactStops, wholeLineOn, onToggleWholeLine, children }: GraphViewportProps) {
  const [{ transform }, dispatch] = useReducer(viewportReducer, drawing, initialViewport);
  const svgRef = useMeasuredBox<SVGSVGElement>(dispatch);
  const pointerHandlers = usePointerDrag(dispatch);

  useWheelNavigation(svgRef, dispatch);
  useRedrawn(drawing, dispatch);
  useRevealed(reveal, coveredBelow, dispatch);

  return (
    <div className={styles.viewport}>
      <svg
        ref={svgRef}
        className={styles.box}
        role="group"
        aria-label="Graph viewport"
        tabIndex={0}
        onKeyDown={({ key }) => {
          const action = keyAction(key);
          if (action) dispatch(action);
        }}
        {...pointerHandlers}
      >
        <g transform={svgTransformOf(transform)}>{children}</g>
      </svg>
      <div className={styles.controls}>
        <ViewportControls dispatch={dispatch} mainPathOn={mainPathOn} onToggleMainPath={onToggleMainPath} compactStopsOn={compactStopsOn} onToggleCompactStops={onToggleCompactStops} wholeLineOn={wholeLineOn} onToggleWholeLine={onToggleWholeLine} />
      </div>
    </div>
  );
}
