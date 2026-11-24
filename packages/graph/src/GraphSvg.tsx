import type { LaidOutEdge, LaidOutNode } from "./elk-layout";
import type { Drawing } from "./run-graph-drawing";
import type { MainPath } from "./metro/main-path";
import { edgeKeyOf } from "./metro/edge-key";
import type { StationVisits } from "./metro/station-visits";
import type { Neighbourhood } from "./metro/neighbourhood";
import ArrowMarkerDefs from "./ArrowMarkerDefs";
import GraphEdge, { EdgeLabel, type EdgeEmphasis } from "./GraphEdge";
import { markerOf } from "./graph-markers";
import type { KeyboardCursor } from "./use-keyboard-cursor";
import GraphNode from "./GraphNode";
import { NODE_HEIGHT } from "./run-graph-geometry";
import styles from "./run-graph.module.css";

export interface DescribedNode {
  nodeId: string;
  tooltipId: string;
}

/** What marks an element of the drawing apart from the rest. */
export interface LineMarks {
  /** What the hovered node touches; everything else dims. Null while nothing is hovered. */
  lit: Neighbourhood | null;
  /** The main line, when only it is drawn in full. */
  mainPath: MainPath | null;
  /** Stations no start leads to. */
  unreachable: ReadonlySet<string>;
  keyboard: KeyboardCursor;
  /** Keys the latest layout added. */
  added: ReadonlySet<string>;
  /** The lines the run took (undefined without a run). */
  taken: ReadonlyMap<string, number> | undefined;
  /** The one connector a station run took, marked when there is no run overlay. */
  takenEdgeKey: string | undefined;
  /** What the run did at each station (undefined without a run). */
  visits: ReadonlyMap<string, StationVisits> | undefined;
}

export interface GraphSvgProps {
  laid: Drawing;
  name: string;
  exit: string;
  /** The node whose tooltip is up, which points at it through aria-describedby. */
  describedNode: DescribedNode | null;
  onSelectNode: ((nodeId: string) => void) | undefined;
  onSelectLine: ((key: string) => void) | undefined;
  selectedLineKey: string | null | undefined;
  selectedNodeId: string | null | undefined;
  onHover: (nodeId: string | null) => void;
  marks: LineMarks;
}

/** The graph itself. A node nothing leaves is terminal, which the plain label renders differently. `role="img"` with a `<title>`: the drawing is one picture to a screen reader, the nodes inside it focusable buttons. */
export default function GraphSvg(props: GraphSvgProps) {
  const { laid, name } = props;
  const { view, titleId } = laid;

  return (
    <svg
      className={styles.svg}
      width={view.width}
      height={view.height}
      role="img"
      aria-labelledby={titleId}
      viewBox={view.viewBox}
    >
      <title id={titleId}>{`Assembly line graph: ${name}`}</title>
      <ArrowMarkerDefs />

      <GraphEdges {...props} />

      <GraphNodes {...props} />

      <GraphEdgeLabels {...props} />
    </svg>
  );
}

/** ELK lays out one path per outcome and the model has one edge per outcome: each laid-out edge draws its own path and label, matched to the model by `edgeKeyOf`. An edge with no model draws neutral rather than disappearing. */
function GraphEdges({
  laid,
  selectedNodeId,
  selectedLineKey,
  onSelectLine,
  marks,
}: GraphSvgProps) {
  const { edges } = laid.layout;
  const { lit, mainPath, keyboard, added } = marks;

  return edges.map((edge) => (
    <GraphEdge
      key={edgeKeyOf(edge)}
      {...edgeProps(edge, laid, selectedNodeId)}
      chosen={edgeKeyOf(edge) === keyboard.chosenKey}
      dimmed={!!lit && !lit.edges.has(edgeKeyOf(edge))}
      selected={edgeKeyOf(edge) === selectedLineKey}
      offPath={isOffPath(mainPath, "edges", edgeKeyOf(edge))}
      added={added.has(edgeKeyOf(edge))}
      taken={takenOf(marks, edgeKeyOf(edge))}
      takenCount={marks.taken?.get(edgeKeyOf(edge))}
      onSelectLine={onSelectLine}
    />
  ));
}

function takenOf({ taken, takenEdgeKey }: LineMarks, key: string): boolean | undefined {
  if (taken) return taken.has(key);

  return key === takenEdgeKey || undefined;
}

function GraphEdgeLabels({
  laid,
  selectedNodeId,
  selectedLineKey,
  onSelectLine,
  marks,
}: GraphSvgProps) {
  const { edges } = laid.layout;
  const { lit, mainPath, taken } = marks;

  return edges.map((edge) => (
    <EdgeLabel
      key={edgeKeyOf(edge)}
      {...edgeProps(edge, laid, selectedNodeId)}
      dimmed={!!lit && !lit.edges.has(edgeKeyOf(edge))}
      selected={edgeKeyOf(edge) === selectedLineKey}
      offPath={isOffPath(mainPath, "edges", edgeKeyOf(edge))}
      takenCount={taken?.get(edgeKeyOf(edge))}
      onSelectLine={onSelectLine}
    />
  ));
}

function edgeProps(
  edge: LaidOutEdge,
  laid: Drawing,
  selectedNodeId: GraphSvgProps["selectedNodeId"],
) {
  return {
    edge,
    model: laid.edgeByKey.get(edgeKeyOf(edge)),
    emphasis: emphasisOf(edge.from, selectedNodeId),
  };
}

function emphasisOf(
  from: string,
  selectedNodeId: string | null | undefined,
): EdgeEmphasis {
  if (!selectedNodeId) {
    return undefined;
  }

  return from === selectedNodeId ? "outgoing" : "other";
}

/** Every node in the layout. A node nothing leaves is terminal — the end of a line should read as an end rather than as a step still waiting for a successor. */
function GraphNodes(props: GraphSvgProps) {
  const { nodes } = props.laid.layout;

  return nodes.map((node) => (
    <GraphStation key={node.id} node={node} {...props} />
  ));
}

function GraphStation({
  node,
  ...props
}: GraphSvgProps & { node: LaidOutNode }) {
  const { laid, selectedNodeId, describedNode, onHover, marks } = props;
  const { lit, mainPath, unreachable, added } = marks;
  const model = laid.nodeById.get(node.id);

  return (
    markerOf(node, props.exit) ??
    (model && (
      <GraphNode
        node={node}
        model={model}
        height={NODE_HEIGHT}
        isTerminal={!laid.nodesWithOutgoing.has(node.id)}
        selected={node.id === selectedNodeId}
        isUnreachable={unreachable.has(node.id)}
        isStop={laid.stops.has(node.id)}
        toneByEdge={laid.toneByEdge}
        onSelect={props.onSelectNode}
        onHover={onHover}
        keyboard={marks.keyboard}
        dimmed={!!lit && !lit.nodes.has(node.id)}
        offPath={isOffPath(mainPath, "nodes", node.id)}
        added={added.has(node.id)}
        {...annotationsOf(describedNode, marks.visits, node.id)}
      />
    ))
  );
}

/** What a station says beyond its shape: the tooltip it is described by, and whether and how the run was there. */
function annotationsOf(
  describedNode: DescribedNode | null,
  visits: LineMarks["visits"],
  nodeId: string,
) {
  const stationVisits = visits?.get(nodeId);

  return {
    describedBy:
      describedNode?.nodeId === nodeId ? describedNode.tooltipId : undefined,
    visited: visits && !!stationVisits,
    outcome: stationVisits?.outcome,
    status: stationVisits,
  };
}

function isOffPath(
  mainPath: MainPath | null,
  part: keyof MainPath,
  key: string,
) {
  return !!mainPath && !mainPath[part].has(key);
}
