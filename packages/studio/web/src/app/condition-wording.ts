// How the Events panel words the conditions an event carries, shared by start origins and started lines.
import type { NodeView } from "@protocol";

type Conditions = NodeView["events"]["startedBy"][number]["when"];

/** The trailing ", if <key> is <value>" clauses, one per condition. */
export function conditionWording(when: Conditions): string {
  const clauses = Object.entries(when ?? {}).map(([key, value]) => `${key} is ${value}`);

  return clauses.length === 0 ? "" : `, if ${clauses.join(" and ")}`;
}
