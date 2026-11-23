// The viewport's behavior over time, held with `useReducer`; adding an action is its payload in `ViewportEvents` and its rule in `RULES`.
import type { Box } from "./dag-layout";
import { fitTransform, IDENTITY, isSameTransform, keepInView, panBy, revealArea, UNMEASURED, zoomAt, type BoxOffset, type BoxPoint, type Size, type ViewportTransform } from "./viewport";

export interface ViewportState {
  drawing: Size;
  box: Size;
  transform: ViewportTransform;
  fitted: boolean;
}

export type ZoomDirection = "in" | "out";

// `{ type: "fit" } & unknown` is just `{ type: "fit" }`, and extra fields are still rejected.
type NoPayload = unknown;

interface ViewportEvents {
  measured: { box: Size };
  redrawn: { drawing: Size };
  dragged: { drag: BoxOffset };
  scrolled: { delta: BoxOffset };
  pinched: { anchor: BoxPoint; delta: number };
  zoomed: { direction: ZoomDirection };
  revealed: { area: Box; coveredBelow?: number };
  fit: NoPayload;
}

type ViewportKind = keyof ViewportEvents;

type ActionOf<Kind extends ViewportKind> = { [Each in Kind]: { type: Each } & ViewportEvents[Each] }[Kind];

export type ViewportAction = ActionOf<ViewportKind>;

type Rule<Kind extends ViewportKind> = (state: ViewportState, action: ActionOf<Kind>) => ViewportState;

const WHEEL_DISTANCE_TO_DOUBLE = 100;
const ZOOM_STEP = 1.25;
const ZOOM_FACTORS: Record<ZoomDirection, number> = { in: ZOOM_STEP, out: 1 / ZOOM_STEP };

export function initialViewport(drawing: Size): ViewportState {
  return { drawing, box: UNMEASURED, transform: IDENTITY, fitted: true };
}

export function viewportReducer(state: ViewportState, action: ViewportAction): ViewportState {
  return applied(state, action);
}

// Generic so TypeScript pairs `RULES[action.type]` with its own action kind without a cast.
function applied<Kind extends ViewportKind>(state: ViewportState, action: ActionOf<Kind>): ViewportState {
  const rule: Rule<Kind> = RULES[action.type];

  return rule(state, action);
}

const RULES: { [Kind in ViewportKind]: Rule<Kind> } = {
  measured: (state, { box }) => settled({ ...state, box }),
  redrawn: (state, { drawing }) => settled({ ...state, drawing }),
  dragged: (state, { drag }) => movedByPerson(state, panBy(state.transform, drag)),
  scrolled: (state, { delta }) => movedByPerson(state, panBy(state.transform, scrollAsDrag(delta))),
  pinched: (state, { anchor, delta }) => movedByPerson(state, zoomAt(state.transform, anchor, pinchAsZoom(delta))),
  zoomed: (state, { direction }) => movedByPerson(state, zoomAt(state.transform, boxCenter(state.box), ZOOM_FACTORS[direction])),
  revealed: (state, { area, coveredBelow }) => movedIfChanged(state, revealArea(state.transform, area, state.box, coveredBelow)),
  fit: (state) => settled({ ...state, fitted: true }),
};

function movedIfChanged(state: ViewportState, transform: ViewportTransform): ViewportState {
  return isSameTransform(state.transform, transform) ? state : movedByPerson(state, transform);
}

function movedByPerson(state: ViewportState, transform: ViewportTransform): ViewportState {
  return settled({ ...state, transform, fitted: false });
}

// A fitted view follows the drawing and the box; a view the person moved is only held in the box.
function settled(state: ViewportState): ViewportState {
  const { drawing, box, transform, fitted } = state;

  return { ...state, transform: fitted ? fitTransform(drawing, box) : keepInView(transform, drawing, box) };
}

function boxCenter(box: Size): BoxPoint {
  return { x: box.width / 2, y: box.height / 2 };
}

// Wheel up (negative delta) zooms in, wheel down zooms out.
function pinchAsZoom(pinch: number): number {
  return 2 ** (-pinch / WHEEL_DISTANCE_TO_DOUBLE);
}

// A wheel delta says where the view travels over the drawing, so the drawing itself travels the opposite way.
function scrollAsDrag(scroll: BoxOffset): BoxOffset {
  return { x: -scroll.x, y: -scroll.y };
}
