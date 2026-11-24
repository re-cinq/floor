import FieldFrame from "./FieldFrame";
import type { FieldProps } from "./field-props";

export default function EnumField({ name, value, help, options, onChange }: FieldProps) {
  return (
    <FieldFrame name={name} help={help}>
      {(helpId) => (
        <select value={String(value ?? "")} onChange={(event) => onChange(event.target.value || undefined)} aria-describedby={helpId}>
          <option value="">(default)</option>
          {options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
    </FieldFrame>
  );
}
