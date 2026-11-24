// What a station card says: its title, and under it the family it belongs to.
import styles from "./run-graph.module.css";

export interface NodeTitleProps {
  title: string;
  kind: string;
  isUnreachable?: boolean;
  centerX: number;
  centerY: number;
}

export default function NodeTitle({ title, kind, isUnreachable, centerX, centerY }: NodeTitleProps) {
  return (
    <>
      <text className={styles.nodeId} x={centerX} y={centerY - 2} textAnchor="middle">
        {title}
      </text>
      <text className={isUnreachable ? styles.nodeUnreachable : styles.nodeKind} x={centerX} y={centerY + 12} textAnchor="middle">
        {isUnreachable ? "unreachable" : kind}
      </text>
    </>
  );
}
