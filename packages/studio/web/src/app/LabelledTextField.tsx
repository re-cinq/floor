import { useId, type ReactNode } from "react";
import styles from "./labelled-text-field.module.css";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  addon?: ReactNode;
}

export default function LabelledTextField({ label, value, onChange, addon }: Props) {
  const inputId = useId();
  const input = <input id={inputId} type="text" value={value} onChange={(event) => onChange(event.target.value)} />;

  if (!addon) {
    return (
      <label className={styles.field}>
        {label}
        {input}
      </label>
    );
  }

  return (
    <div className={styles.field}>
      <label htmlFor={inputId}>{label}</label>
      <div className={styles.group}>
        {input}
        {addon}
      </div>
    </div>
  );
}
