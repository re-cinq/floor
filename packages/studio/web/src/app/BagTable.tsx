import LabelledTextField from "./LabelledTextField";
import PathField from "./PathField";
import type { ListFolder, PathMode } from "./PathPicker";
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
  listFolder: ListFolder | undefined;
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

export default function BagTable({ line, asked, entered, missing, onEnter, listFolder }: Props) {
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
              <ValueField name={name} kind={kind} entered={entered} missing={missing} onEnter={onEnter} listFolder={listFolder} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const PATH_MODES: Partial<Record<string, PathMode>> = { git: "folder", file: "file" };

function ValueField({ name, kind, entered, missing, onEnter, listFolder }: Omit<Props, "line" | "asked"> & { name: string; kind: string }) {
  const common = { labelClass: styles.visuallyHidden, label: name, value: entered[name] ?? "", onChange: (value: string) => onEnter({ ...entered, [name]: value }), error: missing.includes(name) ? `${name} is missing` : undefined };
  const mode = PATH_MODES[kind];

  return mode ? <PathField {...common} mode={mode} browseLabel={`Browse for ${name}`} listFolder={listFolder} /> : <LabelledTextField {...common} />;
}
