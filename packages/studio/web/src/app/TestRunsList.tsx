import type { TestRunListings } from "@/socket/studio-connection";
import styles from "./line.module.css";

interface TestRunsListProps {
  runs: TestRunListings;
  onOpen?: (run: string) => void;
}

export default function TestRunsList({ runs, onOpen }: TestRunsListProps) {
  if (runs.length === 0) return null;

  return (
    <ul aria-label="Test runs" className={styles.testRuns}>
      {runs.map(({ run, folder, status, startedAt, ending }) => (
        <li key={run}>
          <button type="button" onClick={() => onOpen?.(run)}>
            <span>{ending?.outcome ?? status}</span> <span>{new Date(startedAt).toLocaleTimeString([], { timeStyle: "short" })}</span> <span className={styles.file}>{folder.split("/").pop()}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
