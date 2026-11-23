// Renders an assembly line — lays out the nodes/connectors from graph-view-model and hands drawing to its sibling files; every node also says its outcomes and badges as text, so meaning never rests on color alone.
import { useMemo } from "react";
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import { layerByLongestPath, layoutAssemblyLine } from "./dag-layout";
import { typeFamilyOf } from "./node-type-family";
import { deriveVisibleGraph, type VisibleGraph } from "./graph-view-model";
import ArrowMarkerDefs from "./ArrowMarkerDefs";
import GraphEdge, { EdgeLabel, type EdgeEmphasis } from "./GraphEdge";
import GraphNode from "./GraphNode";
import GraphViewport from "./GraphViewport";
import { useNodeTooltip } from "./use-node-tooltip";
import NodeTooltip from "./NodeTooltip";
import { nodeTooltipOf } from "./node-tooltip";
import RunGraphLegend from "./RunGraphLegend";
import { useElementSize } from "./use-element-size";
import { columnsToFit } from "./wrap-to-fit";
import type { Size } from "./viewport";
import {
  LAYER_GAP,
  NODE_WIDTH,
  edgeMapKey,
  fitView,
  nodeHeightFor,
  revealBoxOf,
  toLayoutDefinition,
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

// The graph: wrapped onto the column count that shows it largest in the panel, then fitted to it by the viewport.
export default function RunGraphView(props: RunGraphViewProps) {
  const [panelRef, panelBox] = useElementSize<HTMLElement>();
  const graph = useMemo(() => deriveVisibleGraph(props.definition), [props.definition]);

  if (graph.nodes.length === 0) {
    return <EmptyGraph />;
  }

  return (
    <section ref={panelRef} className={styles.panel} aria-label={`Graph of ${props.definition.name}`}>
      <GraphCanvas view={props} graph={graph} panelBox={panelBox} />
      <RunGraphLegend families={familiesOf(graph)} />
    </section>
  );
}

interface GraphCanvasProps {
  view: RunGraphViewProps;
  graph: VisibleGraph;
  panelBox: Size | null;
}

/** The drawing in its viewport, and the tooltip of the node under the pointer or the focus (run-viz FR4.1h). */
function GraphCanvas({ view, graph, panelBox }: GraphCanvasProps) {
  const tooltip = useNodeTooltip();
  const laid = useMemo(
    () => layoutGraph(graph, view.definition, columnsInBox(graph, view.definition, panelBox)),
    [graph, view.definition, panelBox],
  );

  return (
    <>
      <div className={styles.canvas} {...tooltip.handlers}>
        <GraphViewport drawing={laid.view} reveal={revealOf(laid, view.selectedNodeId)} coveredBelow={view.coveredBelow}>
          <GraphSvg
            laid={laid}
            graph={graph}
            name={view.definition.name}
            onSelectNode={view.onSelectNode}
            selectedNodeId={view.selectedNodeId}
            describedNode={describedNodeOf(tooltip)}
          />
        </GraphViewport>
      </div>
      <GraphTooltip {...tooltip} definition={view.definition} />
    </>
  );
}

/** The column count whose wrapped drawing shows largest in the box; unmeasured, one row. */
function columnsInBox(graph: VisibleGraph, definition: AssemblyLineDefinition, box: Size | null): number {
  if (box === null) {
    return Number.POSITIVE_INFINITY;
  }

  const layers = layerByLongestPath(toLayoutDefinition(graph, definition)).values();
  const layerCount = Math.max(...layers) + 1;

  return columnsToFit(layerCount, box, (columns) => layoutGraph(graph, definition, columns).view);
}

function revealOf(laid: ReturnType<typeof layoutGraph>, selectedNodeId: string | null | undefined) {
  const { nodes } = laid.layout;
  const selected = nodes.find((node) => node.id === selectedNodeId);

  return selected && revealBoxOf(selected, laid.view, laid.nodeHeight);
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
  laid: ReturnType<typeof layoutGraph>;
  graph: VisibleGraph;
  name: string;
  /** The node whose tooltip is up, which points at it through aria-describedby. */
  describedNode: DescribedNode | null;
  onSelectNode: RunGraphViewProps["onSelectNode"];
  selectedNodeId: RunGraphViewProps["selectedNodeId"];
}

/** The graph itself. A node nothing leaves is terminal, which the plain label renders differently. `role="img"` with a `<title>`: the drawing is one picture to a screen reader, the nodes inside it focusable buttons. */
function GraphSvg(props: GraphSvgProps) {
  const { laid, name } = props;
  const { layout, view, titleId } = laid;

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

      <GraphEdges {...props} edges={layout.edges} />

      <GraphNodes {...props} />

      <GraphEdgeLabels {...props} edges={layout.edges} />
    </svg>
  );
}

/** A laid-out edge carries only its geometry, so its tone and label are looked up from the model by endpoint pair. An edge with no model draws neutral rather than disappearing. */
function GraphEdges({ edges, laid, selectedNodeId }: EdgesProps) {
  return (
    <>
      {edges.map((edge) => (
        <GraphEdge key={edgeMapKey(edge.from, edge.to)} {...edgeProps(edge, laid, selectedNodeId)} />
      ))}
    </>
  );
}

function GraphEdgeLabels({ edges, laid, selectedNodeId }: EdgesProps) {
  return (
    <>
      {edges.map((edge) => (
        <EdgeLabel key={edgeMapKey(edge.from, edge.to)} {...edgeProps(edge, laid, selectedNodeId)} />
      ))}
    </>
  );
}

type EdgesProps = GraphSvgProps & { edges: GraphEdgesInput };

function edgeProps(edge: GraphEdgesInput[number], laid: GraphSvgProps["laid"], selectedNodeId: GraphSvgProps["selectedNodeId"]) {
  return { edge, model: laid.edgeByPair.get(edgeMapKey(edge.from, edge.to)), emphasis: emphasisOf(edge.from, selectedNodeId) };
}

function emphasisOf(from: string, selectedNodeId: string | null | undefined): EdgeEmphasis {
  if (!selectedNodeId) {
    return undefined;
  }

  return from === selectedNodeId ? "outgoing" : "other";
}

type GraphEdgesInput = ReturnType<typeof layoutAssemblyLine>["edges"];

/** Every node in the layout. A node nothing leaves is terminal — the end of a line should read as an end rather than as a step still waiting for a successor. */
function GraphNodes({ laid, onSelectNode, selectedNodeId, describedNode }: GraphSvgProps) {
  const { nodes } = laid.layout;

  return nodes.map((node) => {
    const model = laid.nodeById.get(node.id);

    return model ? (
      <GraphNode
        key={node.id}
        node={node}
        model={model}
        height={laid.nodeHeight}
        isTerminal={!laid.nodesWithOutgoing.has(node.id)}
        selected={node.id === selectedNodeId}
        onSelect={onSelectNode}
        describedBy={describedNode?.nodeId === node.id ? describedNode.tooltipId : undefined}
      />
    ) : null;
  });
}

/** Everything geometric: where each node sits, how big the canvas has to be, plus the model lookups the drawing needs. */
function layoutGraph(
  graph: VisibleGraph,
  definition: AssemblyLineDefinition,
  columnsPerBand: number,
) {
  const nodeHeight = nodeHeightFor(graph);
  const layout = layoutAssemblyLine(
    toLayoutDefinition(graph, definition),
    layoutOptions(nodeHeight, columnsPerBand),
  );

  return {
    layout,
    view: fitView(layout.contentBox),
    nodeHeight,
    titleId: `graph-title-${definition.name}`,
    ...graphLookups(graph),
  };
}

/** The graph's pitch: full-size nodes, the rows of a layer a node apart, and the columns per band the panel's box picks. */
function layoutOptions(nodeHeight: number, columnsPerBand: number) {
  return {
    layerGap: LAYER_GAP,
    nodeWidth: NODE_WIDTH,
    nodeHeight,
    rowGap: nodeHeight + 48,
    columnsPerBand,
  };
}

/** The lookups that let the drawing match a laid-out node or edge back to its model. A node with no outgoing edge is terminal, which is read from the EDGES rather than from the node, because a definition does not mark its own ends. */
function graphLookups({ nodes, edges }: VisibleGraph) {
  return {
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    edgeByPair: new Map(edges.map((edge) => [edgeMapKey(edge.from, edge.to), edge])),
    nodesWithOutgoing: new Set(edges.map((edge) => edge.from)),
  };
}
