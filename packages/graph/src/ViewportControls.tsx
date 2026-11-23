// The buttons that zoom the viewport and fit the drawing back on screen, each by the action it dispatches.
import type { Dispatch } from "react";
import { viewportControls } from "./viewport-input";
import type { ViewportAction } from "./viewport-state";

export default function ViewportControls({ dispatch }: { dispatch: Dispatch<ViewportAction> }) {
  return viewportControls.map(({ label, action }) => (
    <button key={label} type="button" onClick={() => dispatch(action)}>
      {label}
    </button>
  ));
}
