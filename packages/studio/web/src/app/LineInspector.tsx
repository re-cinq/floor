import { Fragment } from "react";
import type { LineEdge } from "@re-cinq/floor-contracts";
import styles from "./line.module.css";

/** The line inspector's place. It names the selected edge: its stations, its event, whether it is on the main path and its iteration and unattended limits. */
export default function LineInspector({ line, onMainPath }: { line: LineEdge; onMainPath: boolean }) {
  const limits = [
    { label: "Iteration limit", value: line.iterationMax },
    { label: "Unattended limit", value: line.unattendedMax },
  ].filter(({ value }) => value !== undefined);

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
        {limits.map(({ label, value }) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
      </dl>
    </aside>
  );
}
