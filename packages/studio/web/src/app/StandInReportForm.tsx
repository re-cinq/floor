import { useState } from "react";
import LabelledTextField from "./LabelledTextField";
import { refusalOf, type Produced, type ReportField, type ReportOutcome } from "./stand-in-report";

export default function StandInReportForm({ outcome, fields, report }: { outcome: string; fields: ReportField[]; report: ReportOutcome }) {
  const [entered, setEntered] = useState<Produced>({});
  const [refusal, setRefusal] = useState<string>();

  const submit = () => {
    const refused = refusalOf(fields, entered);
    setRefusal(refused);
    if (refused) return;
    const filled = (kind: ReportField["kind"]) => fields.filter((field) => field.kind === kind && entered[field.name]).map(({ name }) => name);
    report({
      outcome,
      produced: Object.fromEntries(filled("value").map((name) => [name, entered[name]])),
      files: Object.fromEntries(filled("file").map((name) => [name, { pasted: entered[name] }])),
    });
  };

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      {fields.map(({ name, kind }) => (
        <LabelledTextField key={name} label={kind === "file" ? `${name} (paste)` : name} value={entered[name] ?? ""} onChange={(value) => setEntered({ ...entered, [name]: value })} />
      ))}
      <button type="button" onClick={submit}>
        {outcome}
      </button>
      {refusal && <p role="alert">{refusal}</p>}
    </form>
  );
}
