// Content hash of a versioned definition (line, station, or agent
// definition — docs/assembly_run_storage.md, "Tables": `definitions.hash`).
// Hashed over sorted keys (array order DOES participate, since
// `selectEdge`'s candidates[0] fallback means edge order can change the
// walk) with `description` denylisted so a new field hashes — and
// over-refuses — by default. Ported verbatim from lore's
// `@re-cinq/lore-assembly-lines` (definition-hash.ts), generalised from
// `AssemblyLine` to any JSON-shaped definition body, since the Floor
// content-hashes three kinds of thing, not one.

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
    .filter(([k, v]) => v !== undefined && !IGNORED_KEYS.has(k))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);

  return `{${fields.join(",")}}`;
}
