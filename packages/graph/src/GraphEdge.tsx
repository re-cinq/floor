// One connector between two steps; its tone carries the branch's meaning, and a hop that branches or loops says its outcome in a label beside it (EdgeLabel), so colour is never the only signal. The selected node's outgoing hops draw bold and the others step back.
import type { LayoutEdge } from "./dag-layout";
import type { VisibleEdge } from "./graph-view-model";
import { ARROW_MARKER_URL } from "./ArrowMarkerDefs";
import { edgeMapKey } from "./run-graph-geometry";
import { classes, edgeStrokeClass, textFillClass } from "./run-graph-tone-classes";
import styles from "./run-graph.module.css";

export type EdgeEmphasis = "outgoing" | "other" | undefined;

export interface GraphEdgeProps {
  edge: LayoutEdge;
  model: VisibleEdge | undefined;
  /** Outgoing: leaves the selected node. Other: something is selected and this hop is not from it. Undefined when nothing is selected. */
  emphasis: EdgeEmphasis;
}

export default function GraphEdge({ edge, model, emphasis }: GraphEdgeProps) {
  const tone = model?.tone ?? "neutral";

  return (
    <g data-edge={edgeMapKey(edge.from, edge.to)} data-tone={tone} data-emphasis={emphasis}>
      <path
        className={classes(
          styles.edge,
          styles[edge.kind],
          edgeStrokeClass(tone),
          emphasis === "outgoing" ? styles.outgoing : undefined,
          emphasis === "other" ? styles.dim : undefined,
        )}
        d={edge.d}
        markerEnd={ARROW_MARKER_URL}
      />
    </g>
  );
}

/** Drawn after the nodes, so a label in the narrow air between two columns is not hidden behind them. */
export function EdgeLabel({ edge, model, emphasis }: GraphEdgeProps) {
  if (!isLabelled(edge, model)) return null;

  return (
    <text
      data-edge-label={edgeMapKey(edge.from, edge.to)}
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

/** A loop or a branch needs its outcome beside it; a lone forward hop already has its outcomes listed in the node it leaves. */
function isLabelled(edge: LayoutEdge, model: VisibleEdge | undefined): model is VisibleEdge {
  return model !== undefined && (model.branching || edge.kind !== "forward");
}
