import FieldFrame from "./FieldFrame";
import type { FieldProps } from "./field-props";

export default function TextField({ name, value, help, format, onChange }: FieldProps) {
  return (
    <FieldFrame name={name} help={help}>
      {(helpId) => <input type={format === "uri" ? "url" : "text"} value={String(value ?? "")} onChange={(event) => onChange(event.target.value || undefined)} aria-describedby={helpId} />}
    </FieldFrame>
  );
}
