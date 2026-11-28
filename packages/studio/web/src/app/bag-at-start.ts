import type { LineStart } from "@re-cinq/floor-contracts";

/** Where an input's value comes from: by API when the line names no event, else one entry per start event with what that event's payload fills it with. */
export function filledFrom(start: LineStart | undefined, name: string): string[] {
  if (!start) return ["by API"];

  return start.on.map((event) => `${event}: ${start.args[name] ?? "—"}`);
}
