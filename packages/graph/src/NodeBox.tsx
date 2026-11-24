// The rectangle of a station card, drawn from its top-left corner.
import { classes } from "./run-graph-tone-classes";
import styles from "./run-graph.module.css";

export interface NodeBoxProps {
  leftEdge: number;
  top: number;
  width: number;
  height: number;
  isUnreachable?: boolean;
}

export default function NodeBox({
  leftEdge,
  top,
  width,
  height,
  isUnreachable,
}: NodeBoxProps) {
  return (
    <rect
      className={classes(
        styles.box,
        isUnreachable ? styles.boxUnreachable : undefined,
      )}
      x={leftEdge}
      y={top}
      width={width}
      height={height}
      rx={10}
    />
  );
}
