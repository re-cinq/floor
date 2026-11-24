import FieldFrame from "./FieldFrame";
import type { FieldProps } from "./field-props";

export default function EnumField({ name, caption, value, help, options, onChange }: FieldProps) {
  return (
    <FieldFrame name={name} caption={caption} help={help}>
      {(helpId) => (
        <select aria-label={name} value={String(value ?? "")} onChange={(event) => onChange(event.target.value || undefined)} aria-describedby={helpId}>
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
