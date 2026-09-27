// Content hash of a versioned definition (line, station, or agent definition); ported from lore's definition-hash.ts. See README.md.

import { createHash } from "node:crypto";

// Prose, at any depth — reworded documentation is not a definition change.
const IGNORED_KEYS = new Set(["description"]);

export function definitionHash(body: unknown): string {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }

  const fields = Object.entries(value)
    .filter(([key, fieldValue]) => fieldValue !== undefined && !IGNORED_KEYS.has(key))
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([key, fieldValue]) => `${JSON.stringify(key)}:${canonicalJson(fieldValue)}`);

  return `{${fields.join(",")}}`;
}
