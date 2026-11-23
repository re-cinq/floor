import type { ConnectionState } from "@/socket/studio-connection";
import styles from "./shell.module.css";

const LABEL: Record<ConnectionState["status"], string> = {
  connecting: "Connecting to the studio",
  open: "Connected to the studio",
  closed: "Disconnected from the studio",
  refused: "The studio refused the connection",
};

const DOT: Record<ConnectionState["status"], string> = {
  connecting: styles.dotConnecting,
  open: styles.dotOpen,
  closed: styles.dotClosed,
  refused: styles.dotRefused,
};

export function labelOf(state: ConnectionState): string {
  return state.status === "closed" && state.retrying ? "Disconnected, trying again" : LABEL[state.status];
}

export default function ConnectionIndicator({ state }: { state: ConnectionState }) {
  return (
    <p className={styles.connection} role="status">
      <span className={`${styles.dot} ${DOT[state.status]}`} aria-hidden="true" />
      {labelOf(state)}
    </p>
  );
}
