// Runs ELK on a line's graph and maps the result into what the view draws.
import ELK, { type ElkEdgeSection, type ElkLabel, type ElkNode, type ElkPort } from "elkjs/lib/elk.bundled.js";
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import { elkGraphOf } from "./elk-graph";

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

export interface ElkLayout {
  nodes: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    ports: { edge: string; side: "in" | "out"; x: number; y: number }[];
  }[];
  edges: {
    from: string;
    to: string;
    on: string;
    kind: "forward" | "back" | "self";
    d: string;
    mid: { x: number; y: number; vertical: boolean };
    labelBox: Box;
  }[];
  contentBox: { minX: number; minY: number; maxX: number; maxY: number };
}

export type LaidOutNode = ElkLayout["nodes"][number];
export type LaidOutEdge = ElkLayout["edges"][number];

/** Lays out a line with ELK: node centres, one SVG path and label centre per edge, and the canvas box. */
export async function layoutWithElk(definition: AssemblyLineDefinition, size?: { width: number; height: number }): Promise<ElkLayout> {
  const laidOut = await new ELK().layout(elkGraphOf(definition, size));
  const nodes = nodesOf(laidOut);

  return {
    nodes,
    edges: edgesOf(laidOut, definition, nodes),
    contentBox: { minX: 0, minY: 0, maxX: laidOut.width ?? 0, maxY: laidOut.height ?? 0 },
  };
}

function nodesOf(laidOut: ElkNode): LaidOutNode[] {
  return (laidOut.children ?? []).map(({ id, x: left = 0, y: top = 0, width = 0, height = 0, ports = [] }) => ({
    id,
    x: left + width / 2,
    y: top + height / 2,
    width,
    height,
    ports: ports.map((port) => portOf(port, left, top)),
  }));
}

function portOf({ id, x: portLeft = 0, y: portTop = 0, width = 0, height = 0 }: ElkPort, left: number, top: number): LaidOutNode["ports"][number] {
  const separator = id.lastIndexOf(":");

  return {
    edge: id.slice(0, separator),
    side: id.slice(separator + 1) === "in" ? "in" : "out",
    x: left + portLeft + width / 2,
    y: top + portTop + height / 2,
  };
}

function edgesOf(laidOut: ElkNode, definition: AssemblyLineDefinition, nodes: LaidOutNode[]): LaidOutEdge[] {
  const centreX = new Map(nodes.map(({ id, x: centre }) => [id, centre]));

  return (laidOut.edges ?? []).map((laidOutEdge, index) => {
    const { from, to, on } = definition.edges[index];
    const labelBox = labelBoxOf(laidOutEdge.labels?.[0]);

    return {
      from,
      to,
      on,
      kind: edgeKindOf(from, to, centreX),
      d: pathOf(laidOutEdge.sections?.[0]),
      mid: centreOf(labelBox),
      labelBox,
    };
  });
}

function pathOf(section?: ElkEdgeSection): string {
  if (!section) return "";
  const { startPoint, bendPoints = [], endPoint } = section;

  return [startPoint, ...bendPoints, endPoint].map(({ x: pointX, y: pointY }, index) => `${index === 0 ? "M" : "L"} ${pointX} ${pointY}`).join(" ");
}

function labelBoxOf(label?: ElkLabel): Box {
  const { x: left = 0, y: top = 0, width = 0, height = 0 } = label ?? {};

  return { minX: left, minY: top, maxX: left + width, maxY: top + height };
}

function centreOf({ minX, minY, maxX, maxY }: Box): LaidOutEdge["mid"] {
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, vertical: false };
}

function edgeKindOf(from: string, to: string, centreX: Map<string, number>): LaidOutEdge["kind"] {
  if (from === to) return "self";

  return (centreX.get(to) ?? 0) > (centreX.get(from) ?? 0) ? "forward" : "back";
}
