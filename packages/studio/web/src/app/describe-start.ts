import type { LineStart } from "@re-cinq/floor-contracts";

export type StartDescription = { via: "api" } | { via: "events"; events: string[]; conditions: string[] };

/** How a line starts, for its header: by API when it names no event, else the events and what each payload must match. */
export function describeStart(start: LineStart | undefined): StartDescription {
  if (!start) return { via: "api" };

  return { via: "events", events: start.on, conditions: Object.entries(start.when ?? {}).map(([field, value]) => `${field} = ${String(value)}`) };
}
