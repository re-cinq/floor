// The two small reads a fan-out needs of a visit: what it produced under a name, and the list a source reported.
import type { Visit } from "./types.js";

export function producedValue(visit: Visit, name: string): string | undefined {
  const produced = visit.report?.produced;

  return produced?.[name];
}

/** The entries a source listed: a JSON array of strings; anything else lists none. */
export function itemsOf(listed: string): string[] {
  try {
    const parsed: unknown = JSON.parse(listed);

    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}
