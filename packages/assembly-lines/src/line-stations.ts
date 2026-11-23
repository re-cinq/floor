// A node's station, resolved (or not) against what the caller knows: shared by every check that reads a station body, since a pinned or unrecognised name means "we cannot see inside this one".
import type { LineNode, StationBody } from "./types.js";

export function hasStation(node: LineNode): node is LineNode & { station: string } {
  return Boolean(node.station);
}

export function bareStationOf(node: LineNode & { station: string }): string {
  const [name] = node.station.split("@");

  return name;
}

export function isPinned(node: LineNode & { station: string }): boolean {
  return node.station.includes("@");
}

/** The station body a bodies map resolves this node to, or undefined when the reference is pinned or the map holds nothing for it. */
export function resolvedStationOf(node: LineNode & { station: string }, bodies: ReadonlyMap<string, StationBody> | undefined): StationBody | undefined {
  return isPinned(node) ? undefined : bodies?.get(bareStationOf(node));
}
