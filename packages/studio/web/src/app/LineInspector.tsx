import type { LineEdge } from "@re-cinq/floor-contracts";
import styles from "./line.module.css";

/** The line inspector's place. It names the selected edge: its stations, its event, whether it is on the main path and its iteration limit. */
export default function LineInspector({ line, onMainPath }: { line: LineEdge; onMainPath: boolean }) {
  return (
    <aside className={styles.inspector} aria-label="Line inspector">
      <h2>Line</h2>
      <dl>
        <dt>from</dt>
        <dd>{line.from}</dd>
        <dt>event</dt>
        <dd>{line.on}</dd>
        <dt>to</dt>
        <dd>{line.to}</dd>
        <dt>Main path</dt>
        <dd>{onMainPath ? "yes" : "no"}</dd>
        {line.iterationMax !== undefined && (
          <>
            <dt>Iteration limit</dt>
            <dd>{line.iterationMax}</dd>
          </>
        )}
      </dl>
    </aside>
  );
}
