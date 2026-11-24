import EnvChip from "../EnvChip";
import { envPlaceholder } from "../env-placeholder";
import FieldFrame from "./FieldFrame";
import type { FieldProps } from "./field-props";

export default function TextField({ name, caption, value, help, format, onChange }: FieldProps) {
  const envName = envPlaceholder(String(value ?? ""));

  return (
    <FieldFrame name={name} caption={caption} help={help}>
      {(helpId) => envName ? <EnvChip envName={envName} onOverride={() => onChange(undefined)} /> : <input aria-label={name} type={format === "uri" ? "url" : "text"} value={String(value ?? "")} onChange={(event) => onChange(event.target.value || undefined)} aria-describedby={helpId} />}
    </FieldFrame>
  );
}
