// The transform that places the drawing in its on-screen box: fit, zoom at a point, pan, keep a strip of the drawing in view, and bring an area of it into view.
import type { Box } from "./dag-layout";

export interface Size {
  width: number;
  height: number;
}

export interface ViewportTransform {
  scale: number;
  x: number;
  y: number;
}

export interface BoxPoint {
  x: number;
  y: number;
}

export interface BoxOffset {
  x: number;
  y: number;
}

const NATURAL_SCALE = 1;
const MIN_SCALE = 0.1;
const MAX_SCALE = 2;

const VISIBLE_STRIP = 48;
const REVEAL_MARGIN = 24;

export const IDENTITY: ViewportTransform = { scale: NATURAL_SCALE, x: 0, y: 0 };

export const UNMEASURED: Size = { width: 0, height: 0 };

export function fitTransform(drawing: Size, box: Size): ViewportTransform {
  if (isUnmeasured(box)) return IDENTITY;

  const scale = Math.min(
    NATURAL_SCALE,
    box.width / drawing.width,
    box.height / drawing.height,
  );

  return {
    scale,
    x: (box.width - drawing.width * scale) / 2,
    y: (box.height - drawing.height * scale) / 2,
  };
}

export function zoomAt(current: ViewportTransform, anchor: BoxPoint, factor: number): ViewportTransform {
  const scale = withinLimits(current.scale * factor, MIN_SCALE, MAX_SCALE);
  const appliedFactor = scale / current.scale;

  return {
    scale,
    x: anchor.x - (anchor.x - current.x) * appliedFactor,
    y: anchor.y - (anchor.y - current.y) * appliedFactor,
  };
}

export function panBy(current: ViewportTransform, drag: BoxOffset): ViewportTransform {
  return { scale: current.scale, x: current.x + drag.x, y: current.y + drag.y };
}

export function keepInView(current: ViewportTransform, drawing: Size, box: Size): ViewportTransform {
  if (isUnmeasured(box)) return current;

  return {
    ...current,
    x: offsetInView(current.x, drawing.width * current.scale, box.width),
    y: offsetInView(current.y, drawing.height * current.scale, box.height),
  };
}

export function revealArea(current: ViewportTransform, area: Box, box: Size): ViewportTransform {
  return {
    ...current,
    x: offsetRevealing(current.x, area.minX * current.scale, area.maxX * current.scale, box.width),
    y: offsetRevealing(current.y, area.minY * current.scale, area.maxY * current.scale, box.height),
  };
}

export function isSameTransform(left: ViewportTransform, right: ViewportTransform): boolean {
  return left.scale === right.scale && left.x === right.x && left.y === right.y;
}

function offsetInView(offset: number, lengthOnScreen: number, boxLength: number): number {
  return withinLimits(offset, VISIBLE_STRIP - lengthOnScreen, boxLength - VISIBLE_STRIP);
}

function offsetRevealing(offset: number, startOnScreen: number, endOnScreen: number, boxLength: number): number {
  return withinLimits(offset, REVEAL_MARGIN - startOnScreen, boxLength - REVEAL_MARGIN - endOnScreen);
}

function withinLimits(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(value, upper));
}

function isUnmeasured(box: Size): boolean {
  return box.width === 0 || box.height === 0;
}
