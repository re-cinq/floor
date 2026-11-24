import type { ElkLayout } from "./elk-layout";
import styles from "./run-graph.module.css";

interface DanglingStubProps {
  node: ElkLayout["nodes"][number];
}

const BAR_HALF_LENGTH = 7;
const LABEL_GAP = 8;
const LABEL_DROP = 12;

/** Where an outcome leads to a line nobody starts: a short end bar with a warning beside it. */
export default function DanglingStub({ node }: DanglingStubProps) {
  return (
    <g data-stub={node.id.replace(/:stub$/, "")}>
      <line className={styles.stubBar} x1={node.x} x2={node.x} y1={node.y - BAR_HALF_LENGTH} y2={node.y + BAR_HALF_LENGTH} />
      <text className={styles.stubText} x={node.x + LABEL_GAP} y={node.y + LABEL_DROP}>
        ⚠ nobody starts on it
      </text>
    </g>
  );
}
