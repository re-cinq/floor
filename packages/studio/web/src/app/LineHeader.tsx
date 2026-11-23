import type { LineView } from "@protocol";
import { describeStart } from "./describe-start";
import styles from "./line.module.css";

export default function LineHeader({ line }: { line: LineView }) {
  return (
    <header className={styles.header}>
      <h1>{line.id}</h1>
      <p className={styles.file}>{line.file}</p>
      <dl className={styles.facts}>
        <dt>entry</dt>
        <dd>{line.entry}</dd>
        <dt>exit</dt>
        <dd>{line.exit}</dd>
        {line.fail && (
          <>
            <dt>fail</dt>
            <dd>{line.fail}</dd>
          </>
        )}
        <dt>starts</dt>
        <dd>
          <StartSummary start={line.start} />
        </dd>
        <dt>args</dt>
        <dd>
          <Args args={line.args} />
        </dd>
      </dl>
    </header>
  );
}

function StartSummary({ start }: { start: LineView["start"] }) {
  const description = describeStart(start);

  if (description.via === "api") return <>by API</>;

  return (
    <>
      on <EventList events={description.events} />
      {description.conditions.length > 0 && <> when {description.conditions.join(" and ")}</>}
    </>
  );
}

function Args({ args }: { args: LineView["args"] }) {
  const entries = Object.entries(args);

  if (entries.length === 0) return <span className="muted">none</span>;

  return (
    <ul className={styles.args}>
      {entries.map(([name, { kind, subject }]) => (
        <li key={name} className={`${styles.arg} ${subject ? styles.subject : ""}`}>
          {name} ({kind}){subject ? ", the subject" : ""}
        </li>
      ))}
    </ul>
  );
}

function EventList({ events }: { events: readonly string[] }) {
  return (
    <>
      {events.map((event, index) => (
        <span key={event}>
          {index > 0 && ", "}
          <code>{event}</code>
        </span>
      ))}
    </>
  );
}
