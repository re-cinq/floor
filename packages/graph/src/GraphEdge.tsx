// One connector between two steps; its tone carries the branch's meaning, and a hop that branches or loops says its outcome in a label beside it (EdgeLabel), so colour is never the only signal. The selected node's outgoing hops draw bold and the others step back.
import type { LaidOutEdge } from "./elk-layout";
import type { VisibleEdge } from "./graph-view-model";
import { ARROW_MARKER_URL } from "./ArrowMarkerDefs";
import { edgeKeyOf } from "./metro/edge-key";
import { classes, edgeStrokeClass, textFillClass } from "./run-graph-tone-classes";
import styles from "./run-graph.module.css";

export type EdgeEmphasis = "outgoing" | "other" | undefined;

export interface GraphEdgeProps {
  edge: LaidOutEdge;
  model: VisibleEdge | undefined;
  /** Outgoing: leaves the selected node. Other: something is selected and this hop is not from it. Undefined when nothing is selected. */
  emphasis: EdgeEmphasis;
  /** Outside the hovered node's neighbourhood. */
  dimmed?: boolean;
  /** The line the inspector shows. */
  selected?: boolean;
  onSelectLine?: (key: string) => void;
}

export default function GraphEdge(props: GraphEdgeProps) {
  const { edge, model, emphasis, dimmed, selected, onSelectLine } = props;
  const tone = model?.tone ?? "neutral";

  return (
    <g data-edge={edgeKeyOf(edge)} data-tone={tone} data-emphasis={emphasis} data-dim={dimmed || undefined} data-selected={selected || undefined} onClick={() => onSelectLine?.(edgeKeyOf(edge))}>
      <path data-hit className={styles.edgeHit} d={edge.d} />
      <path
        className={pathClassOf(edge, tone, emphasis)}
        d={edge.d}
        markerEnd={ARROW_MARKER_URL}
      />
    </g>
  );
}

function pathClassOf(edge: LaidOutEdge, tone: VisibleEdge["tone"], emphasis: EdgeEmphasis) {
  return classes(
    styles.edge,
    styles[edge.kind],
    edgeStrokeClass(tone),
    emphasis === "outgoing" ? styles.outgoing : undefined,
    emphasis === "other" ? styles.dim : undefined,
  );
}

/** Drawn after the nodes, so a label in the narrow air between two columns is not hidden behind them. */
export function EdgeLabel({ edge, model, emphasis, dimmed, selected, onSelectLine }: GraphEdgeProps) {
  if (!model) return null;

  return (
    <text
      data-edge-label={edgeKeyOf(edge)}
      data-dim={dimmed || undefined}
      data-selected={selected || undefined}
      onClick={() => onSelectLine?.(edgeKeyOf(edge))}
      className={classes(styles.edgeLabel, textFillClass(model.tone), emphasis === "other" ? styles.dim : undefined)}
      x={edge.mid.x}
      y={edge.mid.y}
      textAnchor="middle"
      transform={edge.mid.vertical ? `rotate(-90 ${edge.mid.x} ${edge.mid.y})` : undefined}
    >
      {model.label}
    </text>
  );
}
