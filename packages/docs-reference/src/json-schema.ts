// Pure: a JSON Schema made from the floor's own schemas, turned into the one a person's file is checked against.
import type { JsonSchema } from "./field-table.js";

type Spelling = Record<string, string>;

/** Field names as the file spells them. Only names of fields change: a value that reads the same is left. */
export function respelled(schema: JsonSchema, spelling: Spelling): JsonSchema {
  return everySchema(schema, (each) => ({
    ...each,
    ...(each.properties && { properties: Object.fromEntries(Object.entries(each.properties).map(([name, field]) => [spelling[name] ?? name, field])) }),
    ...(each.required && { required: each.required.map((name) => spelling[name] ?? name) }),
  }));
}

const HOLDING_ONE = ["items", "additionalProperties"] as const;

function everySchema(schema: JsonSchema, changed: (schema: JsonSchema) => JsonSchema): JsonSchema {
  const made = changed(schema);
  const inside = (held: JsonSchema): JsonSchema => everySchema(held, changed);

  return {
    ...made,
    ...(made.properties && { properties: Object.fromEntries(Object.entries(made.properties).map(([name, field]) => [name, inside(field)])) }),
    ...(made.anyOf && { anyOf: made.anyOf.map(inside) }),
    ...Object.fromEntries(HOLDING_ONE.flatMap((keyword) => (typeof made[keyword] === "object" ? [[keyword, inside(made[keyword])]] : []))),
  };
}
