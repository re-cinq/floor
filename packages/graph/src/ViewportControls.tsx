// The buttons that zoom the viewport and fit the drawing back on screen, each by the action it dispatches, and the ones that fade the stations off the main line and compact the stops.
import type { Dispatch } from "react";
import ControlIcon from "./ControlIcon";
import ToggleButton from "./ToggleButton";
import { viewportControls } from "./viewport-input";
import type { ViewportAction } from "./viewport-state";

interface ViewportControlsProps {
  dispatch: Dispatch<ViewportAction>;
  mainPathOn?: boolean;
  onToggleMainPath?: () => void;
  compactStopsOn?: boolean;
  onToggleCompactStops?: () => void;
  wholeLineOn?: boolean;
  onToggleWholeLine?: () => void;
}

const MAIN_PATH_ICON = "M2 8h12M2 5v6M14 5v6";
const WHOLE_LINE_ICON = "M4 8h8M2 8a1 1 0 1 0 2 0a1 1 0 1 0-2 0M12 8a1 1 0 1 0 2 0a1 1 0 1 0-2 0";
const COMPACT_STOPS_ICON = "M2 8h3M11 8h3M5 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0";

export default function ViewportControls({ dispatch, mainPathOn, onToggleMainPath, compactStopsOn, onToggleCompactStops, wholeLineOn, onToggleWholeLine }: ViewportControlsProps) {
  return (
    <>
      {viewportControls.map(({ label, icon, action }) => (
        <button key={label} type="button" aria-label={label} title={label} onClick={() => dispatch(action)}>
          <ControlIcon icon={icon} />
        </button>
      ))}
      {onToggleMainPath && <ToggleButton label="Main path" icon={MAIN_PATH_ICON} isOn={mainPathOn} onToggle={onToggleMainPath} />}
      {onToggleCompactStops && <ToggleButton label="Compact stops" icon={COMPACT_STOPS_ICON} isOn={compactStopsOn} onToggle={onToggleCompactStops} />}
      {onToggleWholeLine && <ToggleButton label="Whole line" icon={WHOLE_LINE_ICON} isOn={wholeLineOn} onToggle={onToggleWholeLine} />}
    </>
  );
}
