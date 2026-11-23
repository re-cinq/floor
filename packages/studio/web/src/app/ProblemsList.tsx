import type { ViewProblem } from "@protocol";
import styles from "./line.module.css";

export interface ProblemsListProps {
  problems: readonly ViewProblem[];
  onSelectNode: (nodeId: string) => void;
}

export default function ProblemsList({ problems, onSelectNode }: ProblemsListProps) {
  if (problems.length === 0) return null;

  return (
    <section className={styles.problems} aria-labelledby="problems-title">
      <h2 id="problems-title">
        Problems <span className="count-pill">{problems.length}</span>
      </h2>
      <table>
        <thead>
          <tr>
            <th>rule</th>
            <th>node</th>
            <th>message</th>
          </tr>
        </thead>
        <tbody>
          {problems.map(({ rule, node, message }) => (
            <tr key={`${rule}|${node ?? ""}|${message}`}>
              <td className={styles.rule}>{rule}</td>
              <td>{node ? <button className={styles.problemNode} onClick={() => onSelectNode(node)}>{node}</button> : <span className="muted">the line</span>}</td>
              <td>{message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
