export interface Property {
  type?: string;
  enum?: string[];
  description?: string;
  format?: string;
  items?: Property;
  additionalProperties?: { type?: string };
  properties?: Record<string, Property>;
}

/** An object whose properties are all objects whose properties are all strings. */
export function isGridOfStrings(property: Property): boolean {
  const rows = Object.values(property.properties ?? {});

  return rows.length > 0 && rows.every((row) => row.type === "object" && Object.values(row.properties ?? {}).every((cell) => cell.type === "string"));
}
