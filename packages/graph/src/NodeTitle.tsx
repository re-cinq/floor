// What a station card says: its title, and under it the family it belongs to.
import { fitNodeLabel } from "./run-graph-geometry";
import styles from "./run-graph.module.css";

export interface NodeTitleProps {
  title: string;
  kind: string;
  centerX: number;
  centerY: number;
}

export default function NodeTitle({ title, kind, centerX, centerY }: NodeTitleProps) {
  return (
    <>
      <text className={styles.nodeId} x={centerX} y={centerY - 2} textAnchor="middle">
        {fitNodeLabel(title)}
      </text>
      <text className={styles.nodeKind} x={centerX} y={centerY + 12} textAnchor="middle">
        {kind}
      </text>
    </>
  );
}
