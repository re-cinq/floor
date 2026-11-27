// Pure: which items an assembly run's bag supplies to a station's declared needs, and which needs are missing.
import type { Item, NeedSpec } from "@re-cinq/floor-contracts";
import { personLastActedAt, type NodeVisit, type WalkGraph } from "./transition.js";

export interface NeedItems {
  items: Record<string, Item>;
  missing: string[];
}

interface NeedLookup {
  bind: Record<string, string> | undefined;
  bag: Record<string, Item | undefined>;
  producedSincePerson: ReadonlySet<string> | undefined;
}

export function needItemsOf(
  specs: NeedSpec[],
  bind: Record<string, string> | undefined,
  bag: Record<string, Item | undefined>,
  producedSincePerson?: ReadonlySet<string>,
): NeedItems {
  const lookup: NeedLookup = { bind, bag, producedSincePerson };
  const supplied = new Map<string, Item>();
  const missing: string[] = [];

  for (const spec of specs) {
    supplyNeed(spec, lookup, supplied, missing);
  }

  return { items: Object.fromEntries(supplied), missing };
}

/** The ids of the visits from the one a person last acted at on; undefined when nobody has acted, as everything is then fresh. */
export function visitIdsSincePersonActed(
  graph: WalkGraph,
  visits: readonly (Pick<NodeVisit, "nodeId" | "requestedBy"> & { id: string })[],
): ReadonlySet<string> | undefined {
  const index = personLastActedAt(graph, visits);
  if (index < 0) return undefined;

  return new Set(visits.slice(index).map((visit) => visit.id));
}

function supplyNeed(spec: NeedSpec, lookup: NeedLookup, supplied: Map<string, Item>, missing: string[]): void {
  const found = ownValue(lookup.bag, ownValue(lookup.bind, spec.name) ?? spec.name);

  if (found && !isStaleFor(spec, found, lookup.producedSincePerson)) {
    supplied.set(spec.name, found);

    return;
  }

  if (!spec.optional) {
    missing.push(missingLabel(spec.name, found));
  }
}

function isStaleFor(spec: NeedSpec, found: Item | undefined, producedSincePerson: ReadonlySet<string> | undefined): boolean {
  return Boolean(spec.fresh && found && producedSincePerson && !producedSincePerson.has(found.by));
}

function missingLabel(name: string, staleItem: Item | undefined): string {
  return staleItem ? `${name} (not produced since a person last acted)` : name;
}

function ownValue<Value>(record: Record<string, Value> | undefined, key: string): Value | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined;
}
