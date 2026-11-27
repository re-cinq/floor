// The bag: start items folded with each done visit's produced items, in visit order, later wins.

import { bagOf } from "@re-cinq/floor-assembly-lines";
import type { ProduceSpec } from "@re-cinq/floor-contracts";
import type { DefinitionsStore } from "./definitions.js";
import type { Item, StationBody, Visit } from "./types.js";

export async function foldBag(
  definitions: DefinitionsStore,
  startItems: Record<string, Item>,
  visits: Visit[],
): Promise<Record<string, Item>> {
  const producesByHash = await producesOfEachStation(definitions, visits);

  return bagOf(startItems, visits, (stationHash) => producesByHash.get(stationHash));
}

async function producesOfEachStation(
  definitions: DefinitionsStore,
  visits: Visit[],
): Promise<Map<string, readonly ProduceSpec[] | undefined>> {
  const stationHashes = new Set(visits.flatMap((visit) => (visit.stationHash ? [visit.stationHash] : [])));
  const entries = await Promise.all([...stationHashes].map((hash) => producesOfStation(definitions, hash)));

  return new Map(entries);
}

async function producesOfStation(definitions: DefinitionsStore, hash: string) {
  const station = await definitions.byHashOnly<StationBody>("station", hash);

  return [hash, station?.body.produces] as const;
}
