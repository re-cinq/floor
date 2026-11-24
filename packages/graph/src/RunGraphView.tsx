// Renders an assembly line — lays out the nodes/connectors from graph-view-model and hands drawing to its sibling files; every node also says its outcomes and badges as text, so meaning never rests on color alone.
import { useMemo, useState } from "react";
import { useToggle } from "./use-toggle";
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import { useElkLayout } from "./use-elk-layout";
import type { LaidOutEdge } from "./elk-layout";
import { drawingOf, type Drawing } from "./run-graph-drawing";
import { mainPathOf, type MainPath } from "./metro/main-path";
import { reachabilityOf } from "./metro/reachability";
import { edgeKeyOf } from "./metro/edge-key";
import { isPassThrough } from "./metro/pass-through";
import { neighbourhoodOf, type Neighbourhood } from "./metro/neighbourhood";
import { typeFamilyOf } from "./node-type-family";
import { deriveVisibleGraph, type VisibleGraph } from "./graph-view-model";
import ArrowMarkerDefs from "./ArrowMarkerDefs";
import GraphEdge, { EdgeLabel, type EdgeEmphasis } from "./GraphEdge";
import { markerOf } from "./graph-markers";
import { useKeyboardCursor, type KeyboardCursor } from "./use-keyboard-cursor";
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
  revealBoxOf,
} from "./run-graph-geometry";
import styles from "./run-graph.module.css";

export interface RunGraphViewProps {
  definition: AssemblyLineDefinition;
  onSelectNode?: (nodeId: string) => void;
  onSelectLine?: (key: string) => void;
  /** The line the inspector shows, drawn bold. */
  selectedLineKey?: string | null;
  /** The node the inspector shows, drawn with a ring; its outgoing hops draw bold. */
  selectedNodeId?: string | null;
  /** Height at the bottom of the graph that the inspector covers. */
  coveredBelow?: number;
  /** Draws the pass-through stations as small stops rather than cards. */
  compactStops?: boolean;
  /** Fades the stations and lines off the main line. */
  mainPathOnly?: boolean;
  /** The connector to draw as the one that was taken. */
  takenEdge?: { from: string; to: string; on: string };
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
  const { unreachable, mainPath, mainPathOnly, toggleMainPath } = useLineMarkings(view);
  const { lit, setHoveredId } = useHoverNeighbourhood(view.definition);
  const keyboard = useKeyboardCursor(view.definition);
  const { elkLayout, stops, compactStops, toggleCompactStops } = useStopsLayout(view, graph);
  const laid = useMemo(() => elkLayout && drawingOf(elkLayout, graph, view.definition.name, stops), [elkLayout, graph, view.definition.name, stops]);

  return (
    <>
      <div className={styles.canvas} {...tooltip.handlers}>
        {laid && (
          <GraphViewport drawing={laid.view} reveal={revealOf(laid, view.selectedNodeId)} coveredBelow={view.coveredBelow} mainPathOn={mainPathOnly} onToggleMainPath={toggleMainPath} compactStopsOn={compactStops} onToggleCompactStops={toggleCompactStops}>
            <GraphSvg
              laid={laid}
              graph={graph}
              name={view.definition.name}
              exit={view.definition.exit}
              onSelectNode={view.onSelectNode} onSelectLine={view.onSelectLine} selectedLineKey={view.selectedLineKey}
              selectedNodeId={view.selectedNodeId} takenEdge={view.takenEdge}
              describedNode={describedNodeOf(tooltip)}
              lit={lit} onHover={setHoveredId} keyboard={keyboard}
              unreachable={unreachable} mainPath={mainPath}
            />
          </GraphViewport>
        )}
      </div>
      <GraphTooltip {...tooltip} definition={view.definition} />
    </>
  );
}

/** The stations no start leads to, and the main line of the definition while `mainPathOnly` is set (else null). */
function useLineMarkings({ definition, mainPathOnly: initialMainPathOnly }: RunGraphViewProps) {
  const [mainPathOnly, toggleMainPath] = useToggle({ initiallyOn: initialMainPathOnly });
  const unreachable = useMemo(() => reachabilityOf(definition).unreachable, [definition]);
  const mainPath = useMemo(() => (mainPathOnly ? mainPathOf(definition) : null), [definition, mainPathOnly]);

  return { unreachable, mainPath, mainPathOnly, toggleMainPath };
}

/** The layout, asked to compact its stops when `compactStops` is set, and the stations drawn as stops: the pass-through ones. */
function useStopsLayout({ definition, compactStops: initialCompactStops }: RunGraphViewProps, graph: VisibleGraph) {
  const [compactStops, toggleCompactStops] = useToggle({ initiallyOn: initialCompactStops });
  const layoutOptions = useMemo(() => (compactStops ? { compactStops: true } : undefined), [compactStops]);
  const stops = useMemo(() => stopsOf({ definition, compactStops }, graph), [definition, compactStops, graph]);

  return { elkLayout: useElkLayout(definition, NODE_SIZE, undefined, layoutOptions), stops, compactStops, toggleCompactStops };
}

function stopsOf({ definition, compactStops }: RunGraphViewProps, { nodes }: VisibleGraph): ReadonlySet<string> {
  const nodeIds = nodes.map((node) => node.id);

  return new Set(nodeIds.filter((nodeId) => compactStops && isPassThrough(definition, nodeId)));
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
  onSelectLine: RunGraphViewProps["onSelectLine"];
  selectedLineKey: RunGraphViewProps["selectedLineKey"];
  selectedNodeId: RunGraphViewProps["selectedNodeId"];
  /** What the hovered node touches; everything else dims. Null while nothing is hovered. */
  lit: Neighbourhood | null;
  /** The main line, when only it is drawn in full. */
  mainPath: MainPath | null;
  /** Stations no start leads to. */
  unreachable: ReadonlySet<string>;
  onHover: (nodeId: string | null) => void;
  takenEdge: RunGraphViewProps["takenEdge"];
  keyboard: KeyboardCursor;
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
function GraphEdges({ laid, selectedNodeId, selectedLineKey, lit, mainPath, onSelectLine, keyboard, takenEdge }: GraphSvgProps) {
  const { edges } = laid.layout;

  return edges.map((edge) => (
    <GraphEdge key={edgeKeyOf(edge)} {...edgeProps(edge, laid, selectedNodeId)} chosen={edgeKeyOf(edge) === keyboard.chosenKey} dimmed={!!lit && !lit.edges.has(edgeKeyOf(edge))} selected={edgeKeyOf(edge) === selectedLineKey} offPath={isOffPath(mainPath, "edges", edgeKeyOf(edge))} onSelectLine={onSelectLine} taken={isTaken(edge, takenEdge)} />
  ));
}

function GraphEdgeLabels({ laid, selectedNodeId, selectedLineKey, lit, mainPath, onSelectLine }: GraphSvgProps) {
  const { edges } = laid.layout;

  return edges.map((edge) => (
    <EdgeLabel key={edgeKeyOf(edge)} {...edgeProps(edge, laid, selectedNodeId)} dimmed={!!lit && !lit.edges.has(edgeKeyOf(edge))} selected={edgeKeyOf(edge) === selectedLineKey} offPath={isOffPath(mainPath, "edges", edgeKeyOf(edge))} onSelectLine={onSelectLine} />
  ));
}

function isTaken(edge: LaidOutEdge, takenEdge: RunGraphViewProps["takenEdge"]): boolean {
  return takenEdge !== undefined && edgeKeyOf(edge) === edgeKeyOf(takenEdge);
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
function GraphNodes({ laid, onSelectNode, selectedNodeId, describedNode, exit, lit, mainPath, unreachable, onHover, keyboard }: GraphSvgProps) {
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
        isStop={laid.stops.has(node.id)}
        toneByEdge={laid.toneByEdge}
        onSelect={onSelectNode}
        onHover={onHover}
        keyboard={keyboard}
        dimmed={!!lit && !lit.nodes.has(node.id)}
        offPath={isOffPath(mainPath, "nodes", node.id)}
        describedBy={describedNode?.nodeId === node.id ? describedNode.tooltipId : undefined}
      />
    ) : null;
  });
}

function isOffPath(mainPath: MainPath | null, part: keyof MainPath, key: string) {
  return !!mainPath && !mainPath[part].has(key);
}
