// Pure: the fields of an object in a JSON Schema, as the markdown table a specification shows.
export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: JsonSchema | boolean;
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  format?: string;
  minimum?: number;
  exclusiveMinimum?: number;
  description?: string;
  [keyword: string]: unknown;
}

const HEADER = ["| Field | Type | Required | Description |", "| --- | --- | --- | --- |"];

export function fieldTable(schema: JsonSchema): string {
  const { properties, required = [] } = schema;

  if (!properties) throw new Error("a field table is of an object with properties");
  const rows = Object.entries(properties).map(([name, field]) => `| \`${name}\` | ${typeOf(field)} | ${required.includes(name) ? "yes" : "no"} | ${cell(field.description ?? "")} |`);

  return [...HEADER, ...rows].join("\n");
}

/** The schema a path of field names leads to: `[]` is a list's entries, `*` a map's values. */
export function tableAt(schema: JsonSchema, steps: string[]): JsonSchema {
  return steps.reduce((held, step, index) => {
    const next = stepInto(held, step);

    if (!next) throw new Error(`the schema has no ${step} at ${steps.slice(0, index + 1).join(".")}`);

    return next;
  }, schema);
}

function stepInto(schema: JsonSchema, step: string): JsonSchema | undefined {
  if (step === "[]") return schema.items;
  if (step === "*") return typeof schema.additionalProperties === "object" ? schema.additionalProperties : undefined;

  return schema.properties?.[step];
}

type Named = [applies: (schema: JsonSchema) => boolean, name: (schema: JsonSchema) => string];

// The first that applies names the type.
const TYPE_NAMES: Named[] = [
  [(schema) => "const" in schema, (schema) => code(schema.const)],
  [(schema) => Boolean(schema.enum), (schema) => either((schema.enum ?? []).map(code))],
  [(schema) => Boolean(schema.anyOf), (schema) => either((schema.anyOf ?? []).map(typeOf))],
  [(schema) => Array.isArray(schema.type), (schema) => either(schema.type as string[])],
  [(schema) => schema.type === "array", (schema) => `list of ${typeOf(schema.items ?? {})}`],
  [(schema) => typeof schema.additionalProperties === "object", (schema) => `map of ${typeOf(schema.additionalProperties as JsonSchema)}`],
  [(schema) => schema.format === "uri", () => "URL"],
  [(schema) => schema.exclusiveMinimum === 0, (schema) => `${schema.type} above 0`],
  [(schema) => schema.minimum === 0, (schema) => `${schema.type}, 0 or more`],
];

function typeOf(schema: JsonSchema): string {
  const named = TYPE_NAMES.find(([applies]) => applies(schema));

  return named ? named[1](schema) : String(schema.type ?? "anything");
}

function either(names: string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}

function code(written: unknown): string {
  return `\`${String(written)}\``;
}

function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}
