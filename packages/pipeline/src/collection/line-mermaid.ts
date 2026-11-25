// A line change drawn as two Mermaid flowcharts: before marks what head removes, after marks what head adds; both mark what changed.

import { isDeepStrictEqual } from "node:util";

import type { LineBody } from "@re-cinq/floor-contracts";

type Change = "added" | "removed" | "changed" | "kept";
type Drawn<Part> = { part: Part; change: Change };
type LineNode = LineBody["nodes"][number];
type LineEdge = LineBody["edges"][number];
type LineGraph = Pick<LineBody, "nodes" | "edges">;

const CHANGE_STYLES = {
  added: "stroke:#2da44e,stroke-width:3px",
  removed: "stroke:#cf222e,stroke-width:3px,stroke-dasharray:4 3",
  changed: "stroke:#bf8700,stroke-width:3px",
} as const;
const STYLED_CHANGES = ["added", "removed", "changed"] as const;
const LABEL_ENTITIES = [
  ['"', "#quot;"],
  ["<", "#lt;"],
  [">", "#gt;"],
  ["|", "#124;"],
] as const;
const EMPTY_GRAPH: LineGraph = { nodes: [], edges: [] };

export function afterGraphOf(
  base: LineBody | undefined,
  head: LineBody,
): string {
  return flowchartOf(head, base ?? EMPTY_GRAPH, "added");
}

export function beforeGraphOf(
  base: LineBody,
  head: LineBody | undefined,
): string {
  return flowchartOf(base, head ?? EMPTY_GRAPH, "removed");
}

function flowchartOf(
  shown: LineGraph,
  other: LineGraph,
  onlyShownChange: Change,
): string {
  const nodes = classifyAgainst(
    shown.nodes,
    other.nodes,
    (node) => node.id,
    onlyShownChange,
  );
  const edges = classifyAgainst(
    shown.edges,
    other.edges,
    edgeKeyOf,
    onlyShownChange,
  );

  return [
    "flowchart LR",
    ...nodes.map(
      ({ part }) => `  ${mermaidIdOf(part.id)}["${labelOf(part.id)}"]`,
    ),
    ...edges.map(
      ({ part }) =>
        `  ${mermaidIdOf(part.from)} -->|"${labelOf(edgeLabelOf(part))}"| ${mermaidIdOf(part.to)}`,
    ),
    ...classLinesOf(nodes),
    ...linkStyleLinesOf(edges),
  ].join("\n");
}

function classifyAgainst<Part>(
  shownParts: Part[],
  otherParts: Part[],
  keyOf: (part: Part) => string,
  onlyShownChange: Change,
): Drawn<Part>[] {
  const otherByKey = new Map(otherParts.map((part) => [keyOf(part), part]));

  return shownParts.map((part) => {
    const key = keyOf(part);
    if (!otherByKey.has(key)) return { part, change: onlyShownChange };

    const change = isDeepStrictEqual(otherByKey.get(key), part)
      ? "kept"
      : "changed";

    return { part, change };
  });
}

function edgeKeyOf(edge: LineEdge): string {
  return `${edge.from}|${edge.to}|${edge.on}`;
}

function edgeLabelOf(edge: LineEdge): string {
  const iterationCap =
    edge.iterationMax === undefined ? "" : ` (max ${edge.iterationMax})`;
  const unattendedCap =
    edge.unattendedMax === undefined
      ? ""
      : ` (unattended ${edge.unattendedMax})`;

  return `${edge.on}${iterationCap}${unattendedCap}`;
}

function classLinesOf(nodes: Drawn<LineNode>[]): string[] {
  return STYLED_CHANGES.flatMap((change) => {
    const ids = nodes
      .filter((node) => node.change === change)
      .map((node) => mermaidIdOf(node.part.id));

    return ids.length === 0
      ? []
      : [
          `  classDef ${change} ${CHANGE_STYLES[change]}`,
          `  class ${ids.join(",")} ${change}`,
        ];
  });
}

function linkStyleLinesOf(edges: Drawn<LineEdge>[]): string[] {
  return STYLED_CHANGES.flatMap((change) =>
    edges.flatMap((edge, index) =>
      edge.change === change
        ? [`  linkStyle ${index} ${CHANGE_STYLES[change]}`]
        : [],
    ),
  );
}

function mermaidIdOf(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, "_");
}

function labelOf(id: string): string {
  return LABEL_ENTITIES.reduce(
    (label, [character, entity]) => label.replaceAll(character, entity),
    id,
  );
}
