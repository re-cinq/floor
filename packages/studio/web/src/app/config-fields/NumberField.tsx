import FieldFrame from "./FieldFrame";
import type { FieldProps } from "./field-props";

export default function NumberField({ name, caption, value, help, onChange }: FieldProps) {
  return (
    <FieldFrame name={name} caption={caption} help={help}>
      {(helpId) => <input aria-label={name} type="number" value={value === undefined ? "" : Number(value)} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} aria-describedby={helpId} />}
    </FieldFrame>
  );
}
