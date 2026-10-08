// What a fan-out gives the visits around it: a branch's own entry, and the join's collection of what the branches produced. Both are filled in at open, from the visits already on record, so a redelivered open fills them the same.
import { itemsOf, producedValue } from "./fan-items.js";
import { enforce } from "./refusal.js";
import type { Item, LineBody, LineNode, StationBody, Visit } from "./types.js";

/** The `item` need of a branch of `node`: its entry of the list the newest successful visit of the fanning-out node reported. */
export function itemNeed(line: LineBody, node: LineNode, branch: number | undefined, visits: readonly Visit[]): Record<string, Item> {
  const source = fanSourceOf(line, node);

  if (branch === undefined || source === undefined) return {};
  const entry = itemsOf(newestListing(visits, source.id, source.over) ?? "").at(branch);

  enforce(entry !== undefined, `node "${node.id}": the list "${source.over}" has no entry ${branch}`);

  return { item: { kind: "value", ref: entry, by: "fanout" } };
}

function fanSourceOf(line: LineBody, node: LineNode): { id: string; over: string } | undefined {
  for (const candidate of line.nodes) {
    if (candidate.fanout?.to === node.id) return { id: candidate.id, over: candidate.fanout.over };
  }

  return undefined;
}

function newestListing(visits: readonly Visit[], sourceId: string, over: string): string | undefined {
  const listings = visits.filter((visit) => visit.nodeId === sourceId && visit.report?.outcome === "success").map((visit) => producedValue(visit, over));

  return listings.filter((listed) => listed !== undefined).at(-1);
}

/** How a collected output is read back: what kind a station produces a name as, and the text of a file's blob. */
export interface CollectReaders {
  produceKind(stationHash: string | null, name: string): Promise<"value" | "file">;
  blobText(hash: string): Promise<string>;
}

/** Each `collect` need of the station, filled with a JSON array of what the newest round of branches produced under that name, in branch order: a value as it is, a file as its text. */
export async function collectNeeds(node: LineNode, station: StationBody, visits: readonly Visit[], readers: CollectReaders): Promise<Record<string, Item>> {
  const collecting = station.needs.filter((need) => need.collect !== undefined);
  const filled = await Promise.all(
    collecting.map(async (need): Promise<[string, Item]> => {
      const texts = await collected(visits, need.collect!, readers);

      return [node.bind?.[need.name] ?? need.name, { kind: "value", ref: JSON.stringify(texts), by: "fanout" }];
    }),
  );

  return Object.fromEntries(filled);
}

async function collected(visits: readonly Visit[], name: string, readers: CollectReaders): Promise<string[]> {
  const branches = visits.filter((visit) => visit.branch !== null && producedValue(visit, name) !== undefined);
  const newest = Math.max(0, ...branches.map((visit) => visit.iteration));
  const round = branches.filter((visit) => visit.iteration === newest);
  const ordered = round.sort((first, second) => first.branch! - second.branch!);

  return Promise.all(ordered.map((visit) => textOf(visit, name, readers)));
}

async function textOf(visit: Visit, name: string, readers: CollectReaders): Promise<string> {
  const produced = producedValue(visit, name)!;
  const kind = await readers.produceKind(visit.stationHash, name);

  return kind === "file" ? readers.blobText(produced) : produced;
}
