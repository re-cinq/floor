// The bag: start items folded with each done visit's produced items, in visit order, later wins.

import type { DefinitionsStore } from "./definitions.js";
import type { Item, StationBody, Visit } from "./types.js";

export async function foldBag(
  definitions: DefinitionsStore,
  startItems: Record<string, Item>,
  visits: Visit[],
): Promise<Record<string, Item>> {
  const bag = { ...startItems };
  const produceKinds = new Map<string, Map<string, "value" | "file">>();

  for (const visit of visits) {
    await applyVisit(definitions, bag, produceKinds, visit);
  }

  return bag;
}

async function applyVisit(
  definitions: DefinitionsStore,
  bag: Record<string, Item>,
  produceKinds: Map<string, Map<string, "value" | "file">>,
  visit: Visit,
): Promise<void> {
  const produced = visit.report?.produced;

  if (!produced || !visit.stationHash) return;

  const kinds = await produceKindsOf(definitions, produceKinds, visit.stationHash);

  for (const [name, value] of Object.entries(produced)) {
    const kind = kinds.get(name) ?? "value";

    bag[name] = { kind, ref: value, by: visit.id };
  }
}

async function produceKindsOf(
  definitions: DefinitionsStore,
  cache: Map<string, Map<string, "value" | "file">>,
  stationHash: string,
): Promise<Map<string, "value" | "file">> {
  const cached = cache.get(stationHash);

  if (cached) return cached;

  const station = await definitions.byHashOnly<StationBody>("station", stationHash);
  const kinds = new Map((station?.body.produces ?? []).map((produce) => [produce.name, produce.kind]));

  cache.set(stationHash, kinds);

  return kinds;
}
