// Pure geometry for the graph (box height, viewBox, layout-shaped definition) — no React, no styles, only WHERE things sit.
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import type { Box } from "./dag-layout";
import type { VisibleGraph } from "./graph-view-model";

// Box width, sized for a node's id and its outcome rows; the layout uses this same constant as column pitch.
export const NODE_WIDTH = 216;
// Column pitch: a node box plus the air its connectors curve through.
export const LAYER_GAP = 240;
// Clear space kept around the drawing.
export const VIEW_PADDING = 28;
// Vertical pitch of one outcome row inside a node.
export const OUTCOME_ROW = 15;

// Where a node's text starts (right of the glyph) and the gap it leaves at the far edge.
const LABEL_LEFT_OFFSET = 40;
const LABEL_RIGHT_PADDING = 12;
// Average advance of the node font in px — an average, not a measurement, since SVG text cannot reflow and per-glyph measuring needs a DOM round-trip.
const LABEL_CHAR_WIDTH = 6.8;

// How many characters of node text fit inside one box, derived from NODE_WIDTH rather than hardcoded.
export const NODE_LABEL_CHARS = Math.floor(
  (NODE_WIDTH - LABEL_LEFT_OFFSET - LABEL_RIGHT_PADDING) / LABEL_CHAR_WIDTH,
);

// Backstop, not the mechanism — SVG text neither wraps nor clips itself, so an unforeseen label would draw over its neighbour; pair with a <title> for hover.
export function fitNodeLabel(text: string, max = NODE_LABEL_CHARS): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// An outcome row starts right of its glyph and keeps the same right padding as the title.
export const OUTCOME_LABEL_CHARS = Math.floor((NODE_WIDTH - 34 - LABEL_RIGHT_PADDING) / LABEL_CHAR_WIDTH);

const BASE_NODE_HEIGHT = 48;
const OUTCOME_TOP = 14;
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
export function revealBoxOf(node: { x: number; y: number }, view: FittedView, nodeHeight: number): Box {
  const minX = node.x - NODE_WIDTH / 2 - view.originX;
  const minY = node.y - nodeHeight / 2 - view.originY;

  return { minX, minY, maxX: minX + NODE_WIDTH, maxY: minY + nodeHeight };
}

// Uniform node height: tall enough for the longest outcome list a source node shows; bare nodes stay the base height.
export function nodeHeightFor(graph: VisibleGraph): number {
  const rows = Math.max(0, ...graph.nodes.map((node) => node.outcomes.length));

  return rows > 0
    ? BASE_NODE_HEIGHT + OUTCOME_TOP + rows * OUTCOME_ROW
    : BASE_NODE_HEIGHT;
}

// A layout-shaped definition from the visible graph.
export function toLayoutDefinition(
  graph: VisibleGraph,
  definition: AssemblyLineDefinition,
): AssemblyLineDefinition {
  return {
    name: definition.name,
    description: "",
    version: 1,
    entry: definition.entry,
    exit: definition.exit,
    nodes: layoutNodes(graph),
    edges: layoutEdges(graph),
  };
}

function layoutNodes(graph: VisibleGraph): AssemblyLineDefinition["nodes"] {
  return graph.nodes.map((node) => ({ id: node.id, type: node.type }));
}

// Connectors carry no condition — layout needs structure, not routing.
function layoutEdges(graph: VisibleGraph): AssemblyLineDefinition["edges"] {
  return graph.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    on: "always",
  }));
}

// The one key shape for an edge, shared by the model lookup and the `data-edge` attribute tests query, so the two can never drift apart.
export function edgeMapKey(from: string, to: string): string {
  return `${from}->${to}`;
}
