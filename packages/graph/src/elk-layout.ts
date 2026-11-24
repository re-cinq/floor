// Runs ELK on a line's graph and maps the result into what the view draws.
import ELK, { type ElkEdgeSection, type ElkLabel, type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import { elkGraphOf } from "./elk-graph";

export interface ElkLayout {
  nodes: { id: string; x: number; y: number; width: number; height: number }[];
  edges: {
    from: string;
    to: string;
    on: string;
    kind: "forward" | "back" | "self";
    d: string;
    mid: { x: number; y: number; vertical: boolean };
  }[];
  contentBox: { minX: number; minY: number; maxX: number; maxY: number };
}

type LaidOutNode = ElkLayout["nodes"][number];
type LaidOutEdge = ElkLayout["edges"][number];

/** Lays out a line with ELK: node centres, one SVG path and label centre per edge, and the canvas box. */
export async function layoutWithElk(definition: AssemblyLineDefinition): Promise<ElkLayout> {
  const laidOut = await new ELK().layout(elkGraphOf(definition));
  const nodes = nodesOf(laidOut);

  return {
    nodes,
    edges: edgesOf(laidOut, definition, nodes),
    contentBox: { minX: 0, minY: 0, maxX: laidOut.width ?? 0, maxY: laidOut.height ?? 0 },
  };
}

function nodesOf(laidOut: ElkNode): LaidOutNode[] {
  return (laidOut.children ?? []).map(({ id, x: left = 0, y: top = 0, width = 0, height = 0 }) => ({
    id,
    x: left + width / 2,
    y: top + height / 2,
    width,
    height,
  }));
}

function edgesOf(laidOut: ElkNode, definition: AssemblyLineDefinition, nodes: LaidOutNode[]): LaidOutEdge[] {
  const centreX = new Map(nodes.map(({ id, x: centre }) => [id, centre]));

  return (laidOut.edges ?? []).map((laidOutEdge, index) => {
    const { from, to, on } = definition.edges[index];

    return {
      from,
      to,
      on,
      kind: edgeKindOf(from, to, centreX),
      d: pathOf(laidOutEdge.sections?.[0]),
      mid: labelCentreOf(laidOutEdge.labels?.[0]),
    };
  });
}

function pathOf(section?: ElkEdgeSection): string {
  if (!section) return "";
  const { startPoint, bendPoints = [], endPoint } = section;

  return [startPoint, ...bendPoints, endPoint].map(({ x: pointX, y: pointY }, index) => `${index === 0 ? "M" : "L"} ${pointX} ${pointY}`).join(" ");
}

function labelCentreOf(label?: ElkLabel): LaidOutEdge["mid"] {
  const { x: left = 0, y: top = 0, width = 0, height = 0 } = label ?? {};

  return { x: left + width / 2, y: top + height / 2, vertical: false };
}

function edgeKindOf(from: string, to: string, centreX: Map<string, number>): LaidOutEdge["kind"] {
  if (from === to) return "self";

  return (centreX.get(to) ?? 0) > (centreX.get(from) ?? 0) ? "forward" : "back";
}
