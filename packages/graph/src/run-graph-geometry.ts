// Pure geometry for the graph (box height, viewBox, layout-shaped definition) — no React, no styles, only WHERE things sit.
import type { Box } from "./elk-layout";

// Station card size, the same for every card; ELK is given the same size.
export const NODE_WIDTH = 216;
export const NODE_HEIGHT = 60;
// Clear space kept around the drawing.
export const VIEW_PADDING = 28;

// Where a node's text starts (right of the glyph) and the gap it leaves at the far edge.
const LABEL_LEFT_OFFSET = 40;
const LABEL_RIGHT_PADDING = 12;
// Average advance of the node font in px — an average, not a measurement, since SVG text cannot reflow and per-glyph measuring needs a DOM round-trip.
const LABEL_CHAR_WIDTH = 6.8;

export function cardWidthOf(title: string, subtitle = ""): number {
  const longestLine = Math.max(title.length, subtitle.length);

  return Math.max(
    NODE_WIDTH,
    Math.ceil(
      LABEL_LEFT_OFFSET + longestLine * LABEL_CHAR_WIDTH + LABEL_RIGHT_PADDING,
    ),
  );
}

const PADDING = VIEW_PADDING;
const MIN_VIEW_WIDTH = 480;
const MIN_VIEW_HEIGHT = 200;

export interface FittedView {
  viewBox: string;
  originX: number;
  originY: number;
  width: number;
  height: number;
}

// A padded viewBox around the content, floored to a natural size.
export function fitView(box: Box): FittedView {
  const width = Math.max(box.maxX - box.minX + PADDING * 2, MIN_VIEW_WIDTH);
  const height = Math.max(box.maxY - box.minY + PADDING * 2, MIN_VIEW_HEIGHT);
  const originX = box.minX - PADDING;
  const originY = (box.minY + box.maxY) / 2 - height / 2;

  return {
    viewBox: `${originX} ${originY} ${width} ${height}`,
    originX,
    originY,
    width,
    height,
  };
}

// A node's box in drawing coordinates, which start at the viewBox origin rather than at the layout's.
export function revealBoxOf(
  node: { x: number; y: number; width: number },
  view: FittedView,
  nodeHeight: number,
): Box {
  const minX = node.x - node.width / 2 - view.originX;
  const minY = node.y - nodeHeight / 2 - view.originY;

  return { minX, minY, maxX: minX + node.width, maxY: minY + nodeHeight };
}
