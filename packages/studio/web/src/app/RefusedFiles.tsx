import type { RefusedFile } from "@protocol";
import styles from "./shell.module.css";

export default function RefusedFiles({ files }: { files: readonly RefusedFile[] }) {
  if (files.length === 0) return null;

  return (
    <section className={styles.section} aria-label="Refused files">
      <h2 className={styles.sectionTitle}>refused files</h2>
      <ul className={styles.list}>
        {files.map(({ path, reason }) => (
          <li key={path} className={styles.refused}>
            <span className={styles.refusedPath}>{path}</span>
            <br />
            <span className={styles.refusedReason}>{reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
