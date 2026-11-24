import FieldFrame from "./FieldFrame";
import type { FieldProps } from "./field-props";

export default function NumberField({ name, value, help, onChange }: FieldProps) {
  return (
    <FieldFrame name={name} help={help}>
      {(helpId) => <input type="number" value={value === undefined ? "" : Number(value)} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} aria-describedby={helpId} />}
    </FieldFrame>
  );
}
