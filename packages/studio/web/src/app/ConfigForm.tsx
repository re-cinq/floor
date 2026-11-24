import type React from "react";
import { z } from "zod";
import { agentConfigSchema } from "@re-cinq/floor-pipeline/agent-config";
import CardsField from "./config-fields/CardsField";
import EnumField from "./config-fields/EnumField";
import ListField from "./config-fields/ListField";
import NumberField from "./config-fields/NumberField";
import RecordField from "./config-fields/RecordField";
import TextField from "./config-fields/TextField";
import { schemaProps, withEntry, type FieldProps } from "./config-fields/field-props";
import GridField from "./config-fields/GridField";
import { isGridOfStrings, type Property } from "./config-fields/schema-property";
import { isNested, parseNested } from "./settings-draft";

const properties = (z.toJSONSchema(agentConfigSchema).properties ?? {}) as Record<string, Property | undefined>;

const fieldsByKind: Record<string, ((props: FieldProps) => React.JSX.Element) | undefined> = {
  integer: (props) => <NumberField {...props} />,
  number: (props) => <NumberField {...props} />,
  enum: (props) => <EnumField {...props} />,
  string: (props) => <TextField {...props} />,
  strings: (props) => <ListField {...props} />,
  record: (props) => <RecordField {...props} />,
  grid: (props) => <GridField {...props} />,
  cards: (props) => <CardsField {...props} renderField={renderField} />,
};

function renderField(props: FieldProps): React.JSX.Element | null {
  const field = fieldsByKind[kindOf(props.property)];

  return field ? field(props) : null;
}

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
      {renderField({
        name: key,
        value: config[key],
        ...schemaProps(properties[key]),
        skillNames,
        onChange: (value) => onChange(withEntry(config, key, value)),
      })}
    </div>
  ));
}

function kindOf(property: Property | undefined): string {
  if (property?.type === "array") return arrayKindOf(property);

  return property?.type === "object" ? objectKindOf(property) : scalarKindOf(property);
}

function objectKindOf(property: Property): string {
  if (property.additionalProperties?.type === "string") return "record";

  return isGridOfStrings(property) ? "grid" : "";
}

function scalarKindOf(property: Property | undefined): string {
  return property?.enum ? "enum" : (property?.type ?? "");
}

function arrayKindOf(property: Property): string {
  if (property.items?.type === "object") return "cards";

  return property.items?.type === "string" ? "strings" : "";
}
