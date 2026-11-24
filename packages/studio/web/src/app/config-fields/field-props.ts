import type { Property } from "./schema-property";

export interface FieldProps {
  name: string;
  value: unknown;
  help?: string;
  options?: string[];
  format?: string;
  property?: Property;
  skillNames?: string[];
  onChange: (value: unknown) => void;
}

/** The props a field takes from its schema property. */
export function schemaProps(property: Property | undefined): Pick<FieldProps, "help" | "options" | "format" | "property"> {
  return { help: property?.description, options: property?.enum, format: property?.format, property };
}

/** The record with one key set, or dropped when the value is undefined. */
export function withEntry(record: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
  const others = Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));

  return value === undefined ? others : { ...record, [key]: value };
}
