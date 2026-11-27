import { useId, type ReactNode } from "react";
import styles from "./labelled-text-field.module.css";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  addon?: ReactNode;
  error?: string;
}

export default function LabelledTextField({ label, value, onChange, addon, error }: Props) {
  const inputId = useId();
  const errorId = useId();
  const input = (
    <input id={inputId} type="text" value={value} aria-invalid={error ? "true" : undefined} aria-describedby={error ? errorId : undefined} onChange={(event) => onChange(event.target.value)} />
  );

  return (
    <div className={`${styles.field} ${error ? styles.invalid : ""}`}>
      <label htmlFor={inputId}>{label}</label>
      {addon ? (
        <div className={styles.group}>
          {input}
          {addon}
        </div>
      ) : (
        input
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
