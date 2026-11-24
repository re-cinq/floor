// The buttons that zoom the viewport and fit the drawing back on screen, each by the action it dispatches.
import type { Dispatch } from "react";
import { viewportControls } from "./viewport-input";
import type { ViewportAction } from "./viewport-state";

export default function ViewportControls({ dispatch }: { dispatch: Dispatch<ViewportAction> }) {
  return viewportControls.map(({ label, icon, action }) => (
    <button key={label} type="button" aria-label={label} title={label} onClick={() => dispatch(action)}>
      <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={icon} />
      </svg>
    </button>
  ));
}
