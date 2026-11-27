import type { LineView } from "@protocol";
import styles from "./shell.module.css";

export interface LineListProps {
  lines: readonly LineView[];
  selectedLineId: string | undefined;
  /** The address that selects a line, `socket` and `token` kept. */
  hrefOf: (lineId: string) => string;
  /** Test runs still going, per line. */
  inProgress: Record<string, number>;
}

export default function LineList({ lines, selectedLineId, hrefOf, inProgress }: LineListProps) {
  return (
    <nav aria-label="Assembly lines" className={styles.section}>
      <h2 className={styles.sectionTitle}>assembly lines</h2>
      <ul className={styles.list}>
        {lines.map((line) => (
          <li key={line.id}>
            <a className={styles.lineLink} href={hrefOf(line.id)} aria-current={line.id === selectedLineId ? "page" : undefined}>
              <span className={styles.lineName}>{line.id}</span>
              <span className={styles.nodeCount}>{line.nodes.length} nodes</span>
              {line.problems.length > 0 && (
                <span className={`count-pill ${styles.problemCount}`} aria-label={`${line.problems.length} problems`}>
                  {line.problems.length}
                </span>
              )}
              {inProgress[line.id] > 0 && (
                <span className={`count-pill ${styles.testRunCount}`} aria-label={`${inProgress[line.id]} test run${inProgress[line.id] === 1 ? "" : "s"} in progress`}>
                  {inProgress[line.id]}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
