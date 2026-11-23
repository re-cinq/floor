// Translates browser input on the viewport box into viewport actions.
import type { ViewportAction } from "./viewport-state";

export type ViewportWheel = Pick<WheelEvent, "ctrlKey" | "metaKey" | "deltaX" | "deltaY" | "clientX" | "clientY">;

// A Ctrl wheel is how browsers report a trackpad pinch, and a Cmd wheel zooms too; any other wheel scrolls.
export function wheelAction(wheel: ViewportWheel, boxOrigin: Pick<DOMRect, "left" | "top">): ViewportAction {
  return wheel.ctrlKey || wheel.metaKey
    ? { type: "pinched", anchor: { x: wheel.clientX - boxOrigin.left, y: wheel.clientY - boxOrigin.top }, delta: wheel.deltaY }
    : { type: "scrolled", delta: { x: wheel.deltaX, y: wheel.deltaY } };
}

export interface PointerPosition {
  x: number;
  y: number;
}

export function dragAction(previous: PointerPosition, pointer: PointerPosition): ViewportAction {
  return { type: "dragged", drag: { x: pointer.x - previous.x, y: pointer.y - previous.y } };
}

export interface ViewportControl {
  label: string;
  key: string;
  action: ViewportAction;
}

// One list read by both the buttons and the keyboard, so a control and its key cannot drift apart.
export const viewportControls: ReadonlyArray<ViewportControl> = [
  { label: "Zoom in", key: "+", action: { type: "zoomed", direction: "in" } },
  { label: "Zoom out", key: "-", action: { type: "zoomed", direction: "out" } },
  { label: "Fit", key: "0", action: { type: "fit" } },
];

export function keyAction(key: string): ViewportAction | undefined {
  return viewportControls.find((control) => control.key === key)?.action;
}
