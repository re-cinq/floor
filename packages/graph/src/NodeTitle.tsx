// What a station card says: its title, and under it its subtitle.
import styles from "./run-graph.module.css";

export interface NodeTitleProps {
  title: string;
  subtitle: string;
  isUnreachable?: boolean;
  centerX: number;
  centerY: number;
}

export default function NodeTitle({
  title,
  subtitle,
  isUnreachable,
  centerX,
  centerY,
}: NodeTitleProps) {
  return (
    <>
      <text
        className={styles.nodeId}
        x={centerX}
        y={centerY - 2}
        textAnchor="middle"
      >
        {title}
      </text>
      <text
        className={isUnreachable ? styles.nodeUnreachable : styles.nodeKind}
        x={centerX}
        y={centerY + 12}
        textAnchor="middle"
      >
        {isUnreachable ? "unreachable" : subtitle}
      </text>
    </>
  );
}
