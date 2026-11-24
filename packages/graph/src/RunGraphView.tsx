// Renders an assembly line — lays out the nodes/connectors from graph-view-model and hands drawing to its sibling files; every node also says its outcomes and badges as text, so meaning never rests on color alone.
import { useMemo, useState } from "react";
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import { useElkLayout } from "./use-elk-layout";
import type { ElkLayout, LaidOutEdge } from "./elk-layout";
import { reachabilityOf } from "./metro/reachability";
import { edgeKeyOf } from "./metro/edge-key";
import { neighbourhoodOf, type Neighbourhood } from "./metro/neighbourhood";
import { typeFamilyOf } from "./node-type-family";
import { deriveVisibleGraph, type VisibleGraph } from "./graph-view-model";
import ArrowMarkerDefs from "./ArrowMarkerDefs";
import GraphEdge, { EdgeLabel, type EdgeEmphasis } from "./GraphEdge";
import DanglingStub from "./DanglingStub";
import ExitDot from "./ExitDot";
import GraphNode from "./GraphNode";
import GraphViewport from "./GraphViewport";
import { useNodeTooltip } from "./use-node-tooltip";
import NodeTooltip from "./NodeTooltip";
import { nodeTitle, nodeTooltipOf } from "./node-tooltip";
import RunGraphLegend from "./RunGraphLegend";
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  cardWidthOf,
  fitView,
  revealBoxOf,
} from "./run-graph-geometry";
import styles from "./run-graph.module.css";

export interface RunGraphViewProps {
  definition: AssemblyLineDefinition;
  onSelectNode?: (nodeId: string) => void;
  /** The node the inspector shows, drawn with a ring; its outgoing hops draw bold. */
  selectedNodeId?: string | null;
  /** Height at the bottom of the graph that the inspector covers. */
  coveredBelow?: number;
}

// The graph: laid out by ELK, then fitted to the panel by the viewport. Until ELK resolves, the panel and legend show with an empty canvas.
export default function RunGraphView(props: RunGraphViewProps) {
  const graph = useMemo(() => deriveVisibleGraph(props.definition), [props.definition]);

  if (graph.nodes.length === 0) {
    return <EmptyGraph />;
  }

  return (
    <section className={styles.panel} aria-label={`Graph of ${props.definition.name}`}>
      <GraphCanvas view={props} graph={graph} />
      <RunGraphLegend families={familiesOf(graph)} />
    </section>
  );
}

const NODE_SIZE = { width: NODE_WIDTH, height: NODE_HEIGHT, widthOf: (nodeId: string) => cardWidthOf(nodeTitle(nodeId)) };

interface GraphCanvasProps {
  view: RunGraphViewProps;
  graph: VisibleGraph;
}

/** The drawing in its viewport, and the tooltip of the node under the pointer or the focus (run-viz FR4.1h). */
function GraphCanvas({ view, graph }: GraphCanvasProps) {
  const tooltip = useNodeTooltip();
  const unreachable = useMemo(() => reachabilityOf(view.definition).unreachable, [view.definition]);
  const { lit, setHoveredId } = useHoverNeighbourhood(view.definition);
  const elkLayout = useElkLayout(view.definition, NODE_SIZE);
  const laid = useMemo(() => elkLayout && drawingOf(elkLayout, graph, view.definition.name), [elkLayout, graph, view.definition.name]);

  return (
    <>
      <div className={styles.canvas} {...tooltip.handlers}>
        {laid && (
          <GraphViewport drawing={laid.view} reveal={revealOf(laid, view.selectedNodeId)} coveredBelow={view.coveredBelow}>
            <GraphSvg
              laid={laid}
              graph={graph}
              name={view.definition.name}
              exit={view.definition.exit}
              onSelectNode={view.onSelectNode}
              selectedNodeId={view.selectedNodeId}
              describedNode={describedNodeOf(tooltip)}
              lit={lit}
              unreachable={unreachable}
              onHover={setHoveredId}
            />
          </GraphViewport>
        )}
      </div>
      <GraphTooltip {...tooltip} definition={view.definition} />
    </>
  );
}

/** The neighbourhood of the node under the pointer or the focus, or null while there is none. */
function useHoverNeighbourhood(definition: RunGraphViewProps["definition"]) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const lit = useMemo(() => (hoveredId ? neighbourhoodOf(definition, hoveredId) : null), [hoveredId, definition]);

  return { lit, setHoveredId };
}

function revealOf(laid: Drawing, selectedNodeId: string | null | undefined) {
  const { nodes } = laid.layout;
  const selected = nodes.find((node) => node.id === selectedNodeId);

  return selected && revealBoxOf(selected, laid.view, NODE_HEIGHT);
}

function familiesOf(graph: VisibleGraph) {
  return new Set(graph.nodes.map((node) => typeFamilyOf(node.type)));
}

/** The node the tooltip is up for, and the tooltip's id its group points at. */
function describedNodeOf({
  id,
  anchor,
}: ReturnType<typeof useNodeTooltip>): DescribedNode | null {
  return anchor ? { nodeId: anchor.nodeId, tooltipId: id } : null;
}

function GraphTooltip({
  id,
  anchor,
  definition,
}: ReturnType<typeof useNodeTooltip> & {
  definition: RunGraphViewProps["definition"];
}) {
  const tooltip = anchor && nodeTooltipOf(anchor.nodeId, definition);

  return anchor && tooltip ? (
    <NodeTooltip id={id} tooltip={tooltip} anchor={anchor} />
  ) : null;
}

function EmptyGraph() {
  return <p className={styles.empty}>This assembly line has no nodes to draw.</p>;
}

interface DescribedNode {
  nodeId: string;
  tooltipId: string;
}

interface GraphSvgProps {
  laid: Drawing;
  graph: VisibleGraph;
  name: string;
  exit: string;
  /** The node whose tooltip is up, which points at it through aria-describedby. */
  describedNode: DescribedNode | null;
  onSelectNode: RunGraphViewProps["onSelectNode"];
  selectedNodeId: RunGraphViewProps["selectedNodeId"];
  /** What the hovered node touches; everything else dims. Null while nothing is hovered. */
  lit: Neighbourhood | null;
  /** Stations no start leads to. */
  unreachable: ReadonlySet<string>;
  onHover: (nodeId: string | null) => void;
}

/** The graph itself. A node nothing leaves is terminal, which the plain label renders differently. `role="img"` with a `<title>`: the drawing is one picture to a screen reader, the nodes inside it focusable buttons. */
function GraphSvg(props: GraphSvgProps) {
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
function GraphEdges({ laid, selectedNodeId, lit }: GraphSvgProps) {
  const { edges } = laid.layout;

  return edges.map((edge) => (
    <GraphEdge key={edgeKeyOf(edge)} {...edgeProps(edge, laid, selectedNodeId)} dimmed={!!lit && !lit.edges.has(edgeKeyOf(edge))} />
  ));
}

function GraphEdgeLabels({ laid, selectedNodeId, lit }: GraphSvgProps) {
  const { edges } = laid.layout;

  return edges.map((edge) => (
    <EdgeLabel key={edgeKeyOf(edge)} {...edgeProps(edge, laid, selectedNodeId)} dimmed={!!lit && !lit.edges.has(edgeKeyOf(edge))} />
  ));
}

function edgeProps(edge: LaidOutEdge, laid: Drawing, selectedNodeId: GraphSvgProps["selectedNodeId"]) {
  return { edge, model: laid.edgeByKey.get(edgeKeyOf(edge)), emphasis: emphasisOf(edge.from, selectedNodeId) };
}

function emphasisOf(from: string, selectedNodeId: string | null | undefined): EdgeEmphasis {
  if (!selectedNodeId) {
    return undefined;
  }

  return from === selectedNodeId ? "outgoing" : "other";
}

/** Every node in the layout. A node nothing leaves is terminal — the end of a line should read as an end rather than as a step still waiting for a successor. */
function GraphNodes({ laid, onSelectNode, selectedNodeId, describedNode, exit, lit, unreachable, onHover }: GraphSvgProps) {
  const { nodes } = laid.layout;

  return nodes.map((node) => {
    const model = laid.nodeById.get(node.id);

    const marker = markerOf(node, exit);

    if (marker) {
      return marker;
    }

    return model ? (
      <GraphNode
        key={node.id}
        node={node}
        model={model}
        height={NODE_HEIGHT}
        isTerminal={!laid.nodesWithOutgoing.has(node.id)}
        selected={node.id === selectedNodeId}
        isUnreachable={unreachable.has(node.id)}
        toneByEdge={laid.toneByEdge}
        onSelect={onSelectNode}
        onHover={onHover}
        dimmed={!!lit && !lit.nodes.has(node.id)}
        describedBy={describedNode?.nodeId === node.id ? describedNode.tooltipId : undefined}
      />
    ) : null;
  });
}

function markerOf(node: ElkLayout["nodes"][number], exit: string) {
  if (node.id.endsWith(":exit")) {
    return <ExitDot key={node.id} node={node} exit={exit} />;
  }

  return node.id.endsWith(":stub") ? <DanglingStub key={node.id} node={node} /> : null;
}

type Drawing = ReturnType<typeof drawingOf>;

/** Everything the drawing needs: ELK's layout, the viewport it fits, and the model lookups. */
function drawingOf(layout: ElkLayout, graph: VisibleGraph, name: string) {
  return {
    layout,
    view: fitView(layout.contentBox),
    titleId: `graph-title-${name}`,
    ...graphLookups(graph),
  };
}

/** The lookups that let the drawing match a laid-out node or edge back to its model. A node with no outgoing edge is terminal, which is read from the EDGES rather than from the node, because a definition does not mark its own ends. */
function graphLookups({ nodes, edges }: VisibleGraph) {
  return {
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    edgeByKey: new Map(edges.map((edge) => [edgeKeyOf(edge), edge])),
    toneByEdge: new Map(edges.map((edge) => [edgeKeyOf(edge), edge.tone])),
    nodesWithOutgoing: new Set(edges.map((edge) => edge.from)),
  };
}
