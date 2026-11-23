import { useId } from "react";
import type React from "react";
import { z } from "zod";
import { agentConfigSchema } from "@re-cinq/floor-pipeline/agent-config";
import { CUSTOM } from "./model-choices";
import { isNested, parseNested } from "./settings-draft";

interface Property {
  type?: string;
  enum?: string[];
  description?: string;
  format?: string;
  items?: { type?: string };
}

interface FieldProps {
  name: string;
  value: unknown;
  help?: string;
  options?: string[];
  format?: string;
  skillNames?: string[];
  onChange: (value: number | string | string[] | undefined) => void;
}

const properties = (z.toJSONSchema(agentConfigSchema).properties ?? {}) as Record<string, Property | undefined>;

const fieldsByKind: Record<string, (props: FieldProps) => React.JSX.Element> = {
  integer: (props) => <NumberField {...props} />,
  number: (props) => <NumberField {...props} />,
  enum: (props) => <EnumField {...props} />,
  string: (props) => <TextField {...props} />,
  strings: (props) => <ListField {...props} />,
};

interface ConfigFormProps {
  configText: string;
  skillNames?: string[];
  onChange: (config: Record<string, unknown>) => void;
}

/** The known keys of an agent's config, edited as YAML text, as a form generated from the floor's schema. */
export default function ConfigForm({ configText, skillNames, onChange }: ConfigFormProps) {
  const parsed = parseNested(configText);
  const config = isNested(parsed) ? (parsed as Record<string, unknown>) : {};
  const known = Object.keys(properties).filter((key) => kindOf(properties[key]) in fieldsByKind);

  return known.map((key) => (
    <div key={key}>
      {fieldsByKind[kindOf(properties[key])]({
        name: key,
        value: config[key],
        help: properties[key]?.description,
        options: properties[key]?.enum,
        format: properties[key]?.format,
        skillNames,
        onChange: (value) => {
          const others = Object.fromEntries(Object.entries(config).filter(([name]) => name !== key));
          onChange(value === undefined ? others : { ...config, [key]: value });
        },
      })}
    </div>
  ));
}

function kindOf(property: Property | undefined): string {
  return property?.type === "array" ? arrayKindOf(property) : scalarKindOf(property);
}

function scalarKindOf(property: Property | undefined): string {
  return property?.enum ? "enum" : (property?.type ?? "");
}

function arrayKindOf(property: Property): string {
  return property.items?.type === "string" ? "strings" : "";
}

function NumberField({ name, value, help, onChange }: FieldProps) {
  return (
    <FieldFrame name={name} help={help}>
      {(helpId) => <input type="number" value={value === undefined ? "" : Number(value)} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} aria-describedby={helpId} />}
    </FieldFrame>
  );
}

function TextField({ name, value, help, format, onChange }: FieldProps) {
  return (
    <FieldFrame name={name} help={help}>
      {(helpId) => <input type={format === "uri" ? "url" : "text"} value={String(value ?? "")} onChange={(event) => onChange(event.target.value || undefined)} aria-describedby={helpId} />}
    </FieldFrame>
  );
}

function EnumField({ name, value, help, options, onChange }: FieldProps) {
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

function ListField({ name, value, help, skillNames, onChange }: FieldProps) {
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
              <button type="button" aria-label={`Remove ${name} ${index + 1}`} onClick={() => change(entries.filter((entry, position) => position !== index))}>
                Remove
              </button>
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

interface FieldFrameProps {
  name: string;
  help?: string;
  children: (helpId: string) => React.ReactNode;
}

/** Labels a control with its key and keeps the help text outside the label, tied to the control by aria-describedby. */
function FieldFrame({ name, help, children }: FieldFrameProps) {
  const helpId = useId();

  return (
    <>
      <label>
        <span>{name}</span>
        {children(helpId)}
      </label>
      <span id={helpId}>{help}</span>
    </>
  );
}
