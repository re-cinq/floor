import { useState } from "react";
import { addLabel } from "./item-noun";
import FieldFrame from "./FieldFrame";
import RemoveButton from "./RemoveButton";
import type { FieldProps } from "./field-props";

type Row = [string, string];

export default function RecordField({ name, value, help, caption, onChange }: FieldProps) {
  const [rows, setRows] = useState<Row[]>(() => Object.entries((value ?? {}) as Record<string, string>));

  const change = (next: Row[]) => {
    setRows(next);
    const named = next.filter(([key]) => key !== "");
    onChange(named.length === 0 ? undefined : Object.fromEntries(named));
  };

  const edit = (index: number, side: 0 | 1, text: string) => change(rows.map((row, position) => (position === index ? (side === 0 ? [text, row[1]] : [row[0], text]) : row)));

  return (
    <FieldFrame name={name} help={help}>
      {(helpId) => (
        <>
          {rows.map(([key, entry], index) => (
            <div key={index}>
              <input aria-label={`${name} name ${index + 1}`} value={key} onChange={(event) => edit(index, 0, event.target.value)} aria-describedby={helpId} />
              <input aria-label={`${name} value ${index + 1}`} value={entry} onChange={(event) => edit(index, 1, event.target.value)} />
              <RemoveButton name={name} position={index + 1} onRemove={() => change(rows.filter((row, position) => position !== index))} />
            </div>
          ))}
          <button type="button" onClick={() => change([...rows, ["", ""]])}>
            {addLabel(name, caption)}
          </button>
        </>
      )}
    </FieldFrame>
  );
}
