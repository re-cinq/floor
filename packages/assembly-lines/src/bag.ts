// Pure: the bag is start items folded with each done visit's produced items, in visit order, later wins.

import type { Item, ItemKind, ProduceSpec, Report } from "@re-cinq/floor-contracts";

export interface ProducingVisit {
  id: string;
  stationHash: string | null;
  report: Report | null;
}

type ProducesLookup = (stationHash: string) => readonly ProduceSpec[] | undefined;

export function bagOf(
  startItems: Record<string, Item>,
  visits: readonly ProducingVisit[],
  producesOf: ProducesLookup,
): Record<string, Item> {
  const bag = new Map(Object.entries(startItems));

  for (const visit of visits) {
    foldVisit(bag, visit, producesOf);
  }

  return Object.fromEntries(bag);
}

function foldVisit(
  bag: Map<string, Item>,
  visit: ProducingVisit,
  producesOf: ProducesLookup,
): void {
  const produced = visit.report?.produced;

  if (!produced || !visit.stationHash) return;

  const specs = producesOf(visit.stationHash);

  for (const [name, value] of Object.entries(produced)) {
    bag.set(name, { kind: kindOf(specs, name), ref: value, by: visit.id });
  }
}

function kindOf(specs: readonly ProduceSpec[] | undefined, name: string): ItemKind {
  return specs?.findLast((spec) => spec.name === name)?.kind ?? "value";
}
