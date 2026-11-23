// One connector between two steps; its tone carries the branch's meaning, and a hop that branches or loops says its outcome in a label beside it, so colour is never the only signal. The selected node's outgoing hops draw bold and the others step back.
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

/** A loop or a branch needs its outcome beside it; a lone forward hop already has its outcomes listed in the node it leaves. */
function isLabelled(edge: LayoutEdge, model: VisibleEdge | undefined): model is VisibleEdge {
  return model !== undefined && (model.branching || edge.kind !== "forward");
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
      {isLabelled(edge, model) ? <EdgeLabel edge={edge} model={model} emphasis={emphasis} /> : null}
    </g>
  );
}

function EdgeLabel({ edge, model, emphasis }: { edge: LayoutEdge; model: VisibleEdge; emphasis: EdgeEmphasis }) {
  return (
    <text
      className={classes(styles.edgeLabel, textFillClass(model.tone), emphasis === "other" ? styles.dim : undefined)}
      x={edge.mid.x}
      y={edge.mid.y}
      textAnchor="middle"
    >
      {model.label}
    </text>
  );
}
