import type { ElkLayout } from "./elk-layout";
import styles from "./run-graph.module.css";

interface ExitDotProps {
  node: ElkLayout["nodes"][number];
  exit: string;
}

/** Where a line off the main path ends the run: a ring with a dot, like the exit terminal. */
export default function ExitDot({ node, exit }: ExitDotProps) {
  return (
    <g data-exit-dot={node.id.replace(/:exit$/, "")}>
      <title>{`ends the run at ${exit}`}</title>
      <circle className={styles.exitRing} cx={node.x} cy={node.y} r={6} />
      <circle className={styles.exitCore} cx={node.x} cy={node.y} r={2.5} />
    </g>
  );
}
