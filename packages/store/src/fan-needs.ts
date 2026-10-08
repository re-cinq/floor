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

/** Each `collect` need of the station, filled with a JSON array of what the newest round of branches produced under that name, in branch order. */
export function collectNeeds(node: LineNode, station: StationBody, visits: readonly Visit[]): Record<string, Item> {
  const collecting = station.needs.filter((need) => need.collect !== undefined);

  return Object.fromEntries(
    collecting.map((need): [string, Item] => [node.bind?.[need.name] ?? need.name, { kind: "value", ref: JSON.stringify(collected(visits, need.collect!)), by: "fanout" }]),
  );
}

function collected(visits: readonly Visit[], name: string): string[] {
  const branches = visits.filter((visit) => visit.branch !== null && producedValue(visit, name) !== undefined);
  const newest = Math.max(0, ...branches.map((visit) => visit.iteration));
  const round = branches.filter((visit) => visit.iteration === newest);
  const ordered = round.sort((first, second) => first.branch! - second.branch!);

  return ordered.map((visit) => producedValue(visit, name)!);
}
