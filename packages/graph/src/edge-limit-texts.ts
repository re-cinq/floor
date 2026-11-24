// The loop limits an edge carries, as the words its labels show.
import type { DefinitionEdge } from "./assembly-line-definition";

/** `max I` for iterationMax, then `max U unattended` for unattendedMax; each only when set. */
export function limitTextsOf({ iterationMax, unattendedMax }: DefinitionEdge): string[] {
  const iterationText = iterationMax === undefined ? [] : [`max ${iterationMax}`];
  const unattendedText = unattendedMax === undefined ? [] : [`max ${unattendedMax} unattended`];

  return [...iterationText, ...unattendedText];
}
