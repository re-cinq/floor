import { Fragment, useState } from "react";
import { masksOfPath } from "./file-mask";
import LabelledTextField from "./LabelledTextField";
import PathField from "./PathField";
import type { ListFolder } from "./PathPicker";
import { filesOf, producedOf, refusalOf, type Produced, type ReportField, type ReportOutcome } from "./stand-in-report";

export default function StandInReportForm({ outcome, fields, report, listFolder }: { outcome: string; fields: ReportField[]; report: ReportOutcome; listFolder: ListFolder | undefined }) {
  const [entered, setEntered] = useState<Produced>({});
  const [picked, setPicked] = useState<Produced>({});
  const [refusal, setRefusal] = useState<string>();

  const submit = () => {
    const refused = refusalOf(fields, entered, picked);
    setRefusal(refused);
    if (refused) return;
    report({
      outcome,
      produced: producedOf(fields, entered),
      files: filesOf(fields, entered, picked),
    });
  };

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      {fields.map(({ name, kind, path }) => (
        <Fragment key={name}>
          <LabelledTextField label={kind === "file" ? `${name} (paste)` : name} value={entered[name] ?? ""} onChange={(value) => setEntered({ ...entered, [name]: value })} />
          {kind === "file" && <PathField label={`${name} (file on disk)`} browseLabel={`Browse for ${name}`} mode="file" value={picked[name] ?? ""} onChange={(value) => setPicked({ ...picked, [name]: value })} listFolder={listFolder} masks={masksOfPath(path)} />}
        </Fragment>
      ))}
      <button type="button" onClick={submit}>
        {outcome}
      </button>
      {refusal && <p role="alert">{refusal}</p>}
    </form>
  );
}
