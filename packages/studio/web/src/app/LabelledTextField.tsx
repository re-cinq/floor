import styles from "./labelled-text-field.module.css";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export default function LabelledTextField({ label, value, onChange }: Props) {
  return (
    <label className={styles.field}>
      {label}
      <input type="text" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
