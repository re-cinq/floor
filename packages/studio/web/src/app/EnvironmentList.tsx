import styles from "./shell.module.css";

export interface EnvironmentEntry {
  name: string;
  files: string[];
}

export default function EnvironmentList({ entries }: { entries: readonly EnvironmentEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <section className={styles.section} aria-label="Environment">
      <h2 className={styles.sectionTitle}>environment</h2>
      <ul className={styles.list}>
        {entries.map(({ name, files }) => (
          <li key={name} className={styles.environmentEntry}>
            <details>
              <summary>
                <span className={styles.environmentName}>{name}</span> <span className={styles.environmentFiles}>{files.length === 1 ? "1 file" : `${files.length} files`}</span>
              </summary>
              <ul className={styles.environmentFiles}>
                {files.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
      <p className={styles.environmentNote}>Set by the install that applies this collection.</p>
    </section>
  );
}
