// Which recipes no visit runs any more: the floor's Stations no Agent points at, then the floor's AgentDefinitions no remaining Station points at.
import { RECIPE_LABEL } from "./agent-triple.js";

/** One Station or AgentDefinition as listed; `ref` is a Station's `agentDefRef`. */
export interface Listed {
  name: string;
  createdAt: string;
  labels?: Record<string, string>;
  ref?: string;
}

export interface Listing {
  agentStationRefs: readonly string[];
  stations: readonly Listed[];
  definitions: readonly Listed[];
  now: Date;
}

export interface Unused {
  stations: string[];
  definitions: string[];
}

/** A recipe younger than this is kept: its first visit's Agent may not be created yet. */
const GRACE_MS = 600_000;
/** Earlier releases named a whole triple after its visit and labelled nothing. */
const PER_VISIT_NAME = /^floor-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function unusedRecipes(listing: Listing): Unused {
  const removable = (listed: Listed) => isFloors(listed) && isOld(listed, listing.now);
  const runStations = new Set(listing.agentStationRefs);
  const stations = listing.stations.filter((station) => removable(station) && !runStations.has(station.name));
  const removed = new Set(stations.map((station) => station.name));
  const { stations: listed } = listing;
  const keptDefinitions = new Set(listed.filter((station) => !removed.has(station.name)).map((station) => station.ref));
  const definitions = listing.definitions.filter((definition) => removable(definition) && !keptDefinitions.has(definition.name));

  return { stations: stations.map((station) => station.name), definitions: definitions.map((definition) => definition.name) };
}

function isFloors(listed: Listed): boolean {
  return listed.labels?.[RECIPE_LABEL] === "true" || PER_VISIT_NAME.test(listed.name);
}

function isOld(listed: Listed, now: Date): boolean {
  return now.getTime() - Date.parse(listed.createdAt) >= GRACE_MS;
}
