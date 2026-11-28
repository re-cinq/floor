import LabelledTextField from "./LabelledTextField";
import { filledFrom } from "./bag-at-start";
import styles from "./screens.module.css";
import type { LineView } from "@protocol";
import type { TestPreviewFields, TestPreviewResult } from "@/socket/studio-connection";

interface Props {
  line: LineView;
  asked: TestPreviewResult["asked"];
  entered: TestPreviewFields["entered"];
  missing: string[];
  onEnter: (entered: TestPreviewFields["entered"]) => void;
}

const HEADER = (
  <thead>
    <tr>
      <th>name</th>
      <th>kind</th>
      <th>filled from</th>
      <th>value</th>
    </tr>
  </thead>
);

export default function BagTable({ line, asked, entered, missing, onEnter }: Props) {
  const { args, start } = line;

  return (
    <table aria-label="Bag at start" className={styles.bag}>
      {HEADER}
      <tbody>
        {asked.map(({ name, kind }) => (
          <tr key={name}>
            <td>
              {name} {args[name].subject && <span className={styles.subjectMark}>subject</span>}
            </td>
            <td>{kind}</td>
            <td>
              {filledFrom(start, name).map((entry) => (
                <div key={entry}>{entry}</div>
              ))}
            </td>
            <td>
              <ValueField name={name} entered={entered} missing={missing} onEnter={onEnter} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ValueField({ name, entered, missing, onEnter }: Omit<Props, "line" | "asked"> & { name: string }) {
  return <LabelledTextField labelClass={styles.visuallyHidden} label={name} value={entered[name] ?? ""} onChange={(value) => onEnter({ ...entered, [name]: value })} error={missing.includes(name) ? `${name} is missing` : undefined} />;
}
