// What no visit needs any more: a finished visit Agent whose abort never came, then the floor's Stations no Agent points at, then the floor's AgentDefinitions no remaining Station points at.
import { RECIPE_LABEL } from "./agent-triple.js";
import { DEFINITION_LABEL, VARIANT_ANNOTATION } from "./pushed-recipe.js";

/** One Station or AgentDefinition as listed; `ref` is a Station's `agentDefRef`. */
export interface Listed {
  name: string;
  createdAt: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  ref?: string;
}

export interface Listing {
  agentStationRefs: readonly string[];
  stations: readonly Listed[];
  definitions: readonly Listed[];
  now: Date;
}

/** One Agent as listed. */
export interface ListedAgent {
  name: string;
  phase?: string;
  createdAt: string;
}

export interface Unused {
  agents: string[];
  stations: string[];
  definitions: string[];
}

/** A recipe younger than this is kept: its first visit's Agent may not be created yet. */
const GRACE_MS = 600_000;
/** A finished visit Agent older than this lost its abort: a visit reports long before. */
const ABANDONED_AFTER_MS = 86_400_000;
const FINISHED = new Set(["Succeeded", "Failed"]);
/** Earlier releases named a whole triple after its visit and labelled nothing. */
const PER_VISIT_NAME = /^floor-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Finished visit Agents a day old: their abort, which deletes them, was lost. */
export function abandonedAgents(agents: readonly ListedAgent[], now: Date): string[] {
  return agents
    .filter((agent) => PER_VISIT_NAME.test(agent.name) && FINISHED.has(agent.phase ?? "") && ageOf(agent, now) >= ABANDONED_AFTER_MS)
    .map((agent) => agent.name);
}

export function unusedRecipes(listing: Listing): Omit<Unused, "agents"> {
  const current = newestPushed(listing.stations);
  const removable = (listed: Listed) => isFloors(listed) && isOld(listed, listing.now) && !current.has(listed.name);
  const runStations = new Set(listing.agentStationRefs);
  const stations = listing.stations.filter((station) => removable(station) && !runStations.has(station.name));
  const removed = new Set(stations.map((station) => station.name));
  const { stations: listed } = listing;
  const keptDefinitions = new Set(listed.filter((station) => !removed.has(station.name)).map((station) => station.ref));
  const definitions = listing.definitions.filter((definition) => removable(definition) && !keptDefinitions.has(definition.name));

  return { stations: stations.map((station) => station.name), definitions: definitions.map((definition) => definition.name) };
}

// A pushed recipe waits for its first visit, so no Agent runs it yet: the newest of each agent definition's variant is kept, and an older one goes like any recipe no Agent runs.
function newestPushed(stations: readonly Listed[]): Set<string> {
  const newest = new Map<string, Listed>();

  for (const station of stations.filter(isPushed)) {
    const key = pushedKey(station);
    const held = newest.get(key);

    if (!held || Date.parse(station.createdAt) > Date.parse(held.createdAt)) newest.set(key, station);
  }

  return new Set([...newest.values()].flatMap((station) => [station.name, station.ref ?? station.name]));
}

function isPushed(station: Listed): boolean {
  return Boolean(station.labels?.[DEFINITION_LABEL]);
}

// The agent definition and the variant, apart by a NUL no repository name holds.
function pushedKey(station: Listed): string {
  const { labels, annotations } = station;

  return `${labels?.[DEFINITION_LABEL] ?? ""}\u0000${annotations?.[VARIANT_ANNOTATION] ?? ""}`;
}

function isFloors(listed: Listed): boolean {
  return listed.labels?.[RECIPE_LABEL] === "true" || PER_VISIT_NAME.test(listed.name);
}

function isOld(listed: Listed, now: Date): boolean {
  return ageOf(listed, now) >= GRACE_MS;
}

function ageOf(listed: { createdAt: string }, now: Date): number {
  return now.getTime() - Date.parse(listed.createdAt);
}
