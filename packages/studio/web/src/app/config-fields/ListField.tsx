import { CUSTOM } from "../model-choices";
import FieldFrame from "./FieldFrame";
import RemoveButton from "./RemoveButton";
import type { FieldProps } from "./field-props";

export default function ListField({ name, value, help, skillNames, onChange }: FieldProps) {
  const entries = Array.isArray(value) ? value.map(String) : [];
  const change = (next: string[]) => onChange(next.length === 0 ? undefined : next);
  const choices = name === "skills" ? skillNames : undefined;

  return (
    <FieldFrame name={name} help={help}>
      {(helpId) => (
        <>
          {entries.map((entry, index) => (
            <div key={index}>
              <ListEntry name={name} position={index + 1} entry={entry} choices={choices} helpId={helpId} onEdit={(text) => change(entries.map((current, position) => (position === index ? text : current)))} />
              <RemoveButton name={name} position={index + 1} onRemove={() => change(entries.filter((entry, position) => position !== index))} />
            </div>
          ))}
          <button type="button" onClick={() => change([...entries, ""])}>
            Add to {name}
          </button>
        </>
      )}
    </FieldFrame>
  );
}

interface ListEntryProps extends Omit<ChoiceEntryProps, "choices"> {
  choices?: string[];
}

function ListEntry({ choices, ...props }: ListEntryProps) {
  return choices?.length ? (
    <ChoiceEntry {...props} choices={choices} />
  ) : (
    <input aria-label={`${props.name} ${props.position}`} value={props.entry} onChange={(event) => props.onEdit(event.target.value)} aria-describedby={props.helpId} />
  );
}

interface ChoiceEntryProps {
  name: string;
  position: number;
  entry: string;
  choices: string[];
  helpId: string;
  onEdit: (text: string) => void;
}

function ChoiceEntry({ name, position, entry, choices, helpId, onEdit }: ChoiceEntryProps) {
  const isCustom = !choices.includes(entry);

  return (
    <>
      <select aria-label={`${name} ${position}`} value={isCustom ? "" : entry} onChange={(event) => onEdit(event.target.value)} aria-describedby={helpId}>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
        <option value="">{CUSTOM}</option>
      </select>
      {isCustom && <input aria-label={`Custom ${name} ${position}`} value={entry} onChange={(event) => onEdit(event.target.value)} />}
    </>
  );
}
