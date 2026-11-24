// Geometry checks on a laid-out line: edges running through stations they do not connect, and over labels of other edges.
import type { ElkLayout } from "./elk-layout";
import { edgeKeyOf } from "./metro/edge-key";

const STATION_MARGIN = 2;

type Station = ElkLayout["nodes"][number];
type Edge = ElkLayout["edges"][number];
interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Lists each edge segment that crosses a station box other than the edge's own endpoints. */
export function linesThroughStations(layout: ElkLayout): { edge: string; station: string }[] {
  return layout.edges.flatMap((edge) => stationsCrossedBy(edge, layout.nodes).map((station) => ({ edge: edgeKeyOf(edge), station: station.id })));
}

/** Lists each edge whose path runs through the label box of another edge. */
export function linesOverLabels(layout: ElkLayout): { edge: string; label: string }[] {
  return layout.edges.flatMap((edge) => labelsCrossedBy(edge, layout.edges).map((labelled) => ({ edge: edgeKeyOf(edge), label: edgeKeyOf(labelled) })));
}

/** The other edges whose label box the edge's path runs through; an edge never counts against its own label. */
function labelsCrossedBy(edge: Edge, edges: Edge[]): Edge[] {
  const segments = segmentsOf(edge);
  const others = edges.filter((other) => other !== edge);

  return others.filter((other) => segments.some((segment) => overlaps(segment, labelBoxOf(other))));
}

/** The stations, other than the edge's own endpoints, whose box the edge's path runs through. */
function stationsCrossedBy(edge: Edge, stations: Station[]): Station[] {
  const segments = segmentsOf(edge);
  const others = stations.filter((station) => station.id !== edge.from && station.id !== edge.to);

  return others.filter((station) => segments.some((segment) => overlaps(segment, stationBoxOf(station))));
}

/** One bounding box per straight stretch of the edge's path. */
function segmentsOf({ d }: Edge): Box[] {
  const coordinates = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const corners = Array.from({ length: coordinates.length / 2 }, (slot, index) => ({ across: coordinates[index * 2], down: coordinates[index * 2 + 1] }));

  return corners.slice(1).map((end, index) => {
    const start = corners[index];

    return { left: Math.min(start.across, end.across), right: Math.max(start.across, end.across), top: Math.min(start.down, end.down), bottom: Math.max(start.down, end.down) };
  });
}

function labelBoxOf({ labelBox }: Edge): Box {
  return { left: labelBox.minX, right: labelBox.maxX, top: labelBox.minY, bottom: labelBox.maxY };
}

/** The station box shrunk by a margin, so a path grazing the border does not count as crossing. */
function stationBoxOf(station: Station): Box {
  const halfWidth = station.width / 2 - STATION_MARGIN;
  const halfHeight = station.height / 2 - STATION_MARGIN;

  return { left: station.x - halfWidth, right: station.x + halfWidth, top: station.y - halfHeight, bottom: station.y + halfHeight };
}

function overlaps(first: Box, second: Box): boolean {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
}
