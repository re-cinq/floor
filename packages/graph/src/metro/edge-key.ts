import type { DefinitionEdge } from "../assembly-line-definition";

/** The one identity of an edge on the metro map: "<from>|<to>|<on>". */
export function edgeKeyOf({ from, to, on }: Pick<DefinitionEdge, "from" | "to" | "on">): string {
  return `${from}|${to}|${on}`;
}
