// Renders an assembly line — lays out the nodes/connectors from graph-view-model and hands drawing to its sibling files; every node also says its outcomes and badges as text, so meaning never rests on color alone.
import { useMemo, useState } from "react";
import { useToggle } from "./use-toggle";
import type { AssemblyLineDefinition } from "./assembly-line-definition";
import { useElkLayout } from "./use-elk-layout";
import { drawingOf, type Drawing } from "./run-graph-drawing";
import { mainPathOf } from "./metro/main-path";
import { reachabilityOf } from "./metro/reachability";
import { isPassThrough } from "./metro/pass-through";
import { neighbourhoodOf } from "./metro/neighbourhood";
import { typeFamilyOf } from "./node-type-family";
import { deriveVisibleGraph, type VisibleGraph } from "./graph-view-model";
import GraphSvg, { type DescribedNode } from "./GraphSvg";
import { useKeyboardCursor } from "./use-keyboard-cursor";
import GraphViewport from "./GraphViewport";
import { useLayoutChanges } from "./use-layout-changes";
import { useTakenLines, type RunOverlay } from "./use-run-overlay";
import { edgeKeyOf } from "./metro/edge-key";
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
  run?: RunOverlay;
}

// The graph: laid out by ELK, then fitted to the panel by the viewport. Until ELK resolves, the panel and legend show with an empty canvas.
export default function RunGraphView(props: RunGraphViewProps) {
  const graph = useMemo(
    () => deriveVisibleGraph(props.definition),
    [props.definition],
  );

  if (graph.nodes.length === 0) {
    return <EmptyGraph />;
  }

  return (
    <section
      className={styles.panel}
      aria-label={`Graph of ${props.definition.name}`}
    >
      <GraphCanvas view={props} graph={graph} />
      <RunGraphLegend families={familiesOf(graph)} />
    </section>
  );
}

const NODE_SIZE = {
  width: NODE_WIDTH,
  height: NODE_HEIGHT,
  widthOf: (nodeId: string) => cardWidthOf(nodeTitle(nodeId)),
};

interface GraphCanvasProps {
  view: RunGraphViewProps;
  graph: VisibleGraph;
}

/** The drawing in its viewport, and the tooltip of the node under the pointer or the focus (run-viz FR4.1h). */
function GraphCanvas({ view, graph }: GraphCanvasProps) {
  const { laid, tooltip, marks, toggles, setHoveredId } = useGraphCanvasState(
    view,
    graph,
  );

  return (
    <>
      <div className={styles.canvas} {...tooltip.handlers}>
        {laid && (
          <GraphViewport
            drawing={laid.view}
            reveal={revealOf(laid, view.selectedNodeId)}
            coveredBelow={view.coveredBelow}
            {...toggles}
          >
            <GraphSvg
              laid={laid}
              {...drawnFrom(view)}
              describedNode={describedNodeOf(tooltip)}
              onHover={setHoveredId}
              marks={marks}
            />
          </GraphViewport>
        )}
      </div>
      <GraphTooltip {...tooltip} definition={view.definition} />
    </>
  );
}

/** What the drawing needs from the view: the line's name and exit, and what is selected and how to select. */
function drawnFrom(view: RunGraphViewProps) {
  const { name, exit } = view.definition;
  const { onSelectNode, onSelectLine, selectedLineKey, selectedNodeId } = view;

  return {
    name,
    exit,
    onSelectNode,
    onSelectLine,
    selectedLineKey,
    selectedNodeId,
  };
}

/** Everything the canvas draws from: the laid-out drawing, the tooltip, the marks on its elements and the viewport's two toggles. */
function useGraphCanvasState(view: RunGraphViewProps, graph: VisibleGraph) {
  const { unreachable, mainPath, mainPathOnly, toggleMainPath, taken } =
    useLineMarkings(view);
  const { lit, setHoveredId } = useHoverNeighbourhood(view.definition);
  const keyboard = useKeyboardCursor(view.definition);
  const { elkLayout, added, stops, compactStops, toggleCompactStops } =
    useStopsLayout(view, graph);
  const laid = useMemo(
    () => elkLayout && drawingOf(elkLayout, graph, view.definition.name, stops),
    [elkLayout, graph, view.definition.name, stops],
  );
  const toggles = {
    mainPathOn: mainPathOnly,
    onToggleMainPath: toggleMainPath,
    compactStopsOn: compactStops,
    onToggleCompactStops: toggleCompactStops,
  };

  return {
    laid,
    tooltip: useNodeTooltip(),
    marks: { lit, mainPath, unreachable, keyboard, added, taken, takenEdgeKey: view.takenEdge && edgeKeyOf(view.takenEdge) },
    toggles,
    setHoveredId,
  };
}

/** The stations no start leads to, the lines a run took, and the main line of the definition while `mainPathOnly` is set (else null). */
function useLineMarkings({
  definition,
  run,
  mainPathOnly: initialMainPathOnly,
}: RunGraphViewProps) {
  const [mainPathOnly, toggleMainPath] = useToggle({
    initiallyOn: initialMainPathOnly,
  });
  const unreachable = useMemo(
    () => reachabilityOf(definition).unreachable,
    [definition],
  );
  const mainPath = useMemo(
    () => (mainPathOnly ? mainPathOf(definition) : null),
    [definition, mainPathOnly],
  );

  return {
    unreachable,
    mainPath,
    mainPathOnly,
    toggleMainPath,
    taken: useTakenLines(definition, run),
  };
}

/** The layout, asked to compact its stops when `compactStops` is set, and the stations drawn as stops: the pass-through ones. */
function useStopsLayout(
  { definition, compactStops: initialCompactStops }: RunGraphViewProps,
  graph: VisibleGraph,
) {
  const [compactStops, toggleCompactStops] = useToggle({
    initiallyOn: initialCompactStops,
  });
  const layoutOptions = useMemo(
    () => (compactStops ? { compactStops: true } : undefined),
    [compactStops],
  );
  const stops = useMemo(
    () => stopsOf({ definition, compactStops }, graph),
    [definition, compactStops, graph],
  );

  const elkLayout = useElkLayout(
    definition,
    NODE_SIZE,
    undefined,
    layoutOptions,
  );

  return {
    elkLayout,
    added: useLayoutChanges(elkLayout),
    stops,
    compactStops,
    toggleCompactStops,
  };
}

function stopsOf(
  { definition, compactStops }: RunGraphViewProps,
  { nodes }: VisibleGraph,
): ReadonlySet<string> {
  const nodeIds = nodes.map((node) => node.id);

  return new Set(
    nodeIds.filter(
      (nodeId) => compactStops && isPassThrough(definition, nodeId),
    ),
  );
}

/** The neighbourhood of the node under the pointer or the focus, or null while there is none. */
function useHoverNeighbourhood(definition: RunGraphViewProps["definition"]) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const lit = useMemo(
    () => (hoveredId ? neighbourhoodOf(definition, hoveredId) : null),
    [hoveredId, definition],
  );

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
  return (
    <p className={styles.empty}>This assembly line has no nodes to draw.</p>
  );
}
