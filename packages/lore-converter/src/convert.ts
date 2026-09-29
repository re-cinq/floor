// A lore line, converted (docs/api_sketch.md, the converter's table). What cannot be read from lore's files is said in `notes`, never guessed silently.
import { validateLine, type AgentDefinitionBody, type LineBody, type LineEdge, type LineNode, type StationBody } from "@floor/store";
import { DEFAULT_ARGS, KNOWN_LINES, type EntryStation, type HookStation, type KnownLine } from "./known-lines.js";
import type { LoreLine, LoreNode, LoreRecipe } from "./lore.js";
import {
  agentDefinitionIdOf,
  agentDefinitionOf,
  agentStationOf,
  humanStationOf,
  isHuman,
  serviceStationOf,
  stationIdOf,
  type ConvertOptions,
  type Named,
} from "./nodes.js";

export interface Conversion {
  line: Named<LineBody>;
  stations: Named<StationBody>[];
  agentDefinitions: Named<AgentDefinitionBody>[];
  /** What a person has still to decide or build before the line runs as it did in lore. */
  notes: string[];
}

interface Converted {
  node: LineNode;
  station?: Named<StationBody>;
  agentDefinition?: Named<AgentDefinitionBody>;
  notes: string[];
}

export function convertLine(line: LoreLine, recipes: Partial<Record<string, LoreRecipe>>, options: ConvertOptions): Conversion {
  const known = KNOWN_LINES[line.name] ?? UNKNOWN;
  const converted = line.nodes.map((node) => convertNode(line, node, { recipes, options, known }));
  const body = lineBodyOf(line, converted, known);
  const stations = uniqueById([...converted.flatMap((each) => each.station ?? []), ...addedTo(known).map((added) => ({ id: added.stationId, body: added.station }))]);

  return {
    line: { id: line.name, body },
    stations,
    agentDefinitions: uniqueById(converted.flatMap((each) => each.agentDefinition ?? [])),
    notes: [...converted.flatMap((each) => each.notes), ...lineNotes(line, known), ...refusals(body, stations)],
  };
}

// What this floor would refuse the line for, were it put as it is.
function refusals(body: LineBody, stations: Named<StationBody>[]): string[] {
  const problems = validateLine(body, { stations: new Set(stations.map((station) => station.id)) });

  return problems.map((problem) => `the floor would refuse this line: ${problem}`);
}

/** A line nothing is known of: lore's file, and no more. */
const UNKNOWN: KnownLine = { args: DEFAULT_ARGS, hooks: [] };

// The stations lore's floor was in code: the ones before the line's entry, then the hooks.
function addedTo(known: KnownLine): EntryStation[] {
  return [...firstOf(known), ...known.hooks];
}

function firstOf(known: KnownLine): EntryStation[] {
  return known.first ? [known.first] : [];
}

function lineBodyOf(line: LoreLine, converted: Converted[], known: KnownLine): LineBody {
  const first = firstOf(known);
  const edges = line.edges.map((edge): LineEdge => ({ from: edge.from, to: edge.to, on: edge.on, iterationMax: edge.iteration_max }));
  const entered = first.map((station): LineEdge => ({ from: station.nodeId, to: line.entry, on: "success" }));
  const hooked = known.hooks.reduce(withHook, [...entered, ...edges]);

  return {
    entry: first.map((station) => station.nodeId).at(0) ?? line.entry,
    exit: line.exit,
    start: known.start,
    args: known.args,
    nodes: [...first.map((station) => addedNode(station, "")), ...converted.map((each) => each.node), ...known.hooks.map((hook) => addedNode(hook, hook.after))],
    edges: hooked.map(withoutUnsetBudget),
  };
}

function addedNode(added: EntryStation, follows: string): LineNode {
  const bind = Object.entries(added.bind).map(([need, from]) => [need, from.replace("{node}", follows)]);

  return { id: added.nodeId, station: added.stationId, bind: Object.fromEntries(bind) };
}

// The hook's node takes the edges the node it follows had for these outcomes, and hands on to where they led, when it succeeds. It has no edge for failing: a review nobody could post is not a run that went well, and the run ends as an error saying so.
function withHook(edges: LineEdge[], hook: HookStation): LineEdge[] {
  const taken = edges.filter((edge) => edge.from === hook.after && hook.outcomes.includes(edge.on));
  const kept = edges.filter((edge) => !taken.includes(edge));
  const onward = [...new Set(taken.map((edge) => edge.to))].map((to): LineEdge => ({ from: hook.nodeId, to, on: "success" }));

  return [...kept, ...taken.map((edge) => ({ ...edge, to: hook.nodeId })), ...onward];
}

function withoutUnsetBudget(edge: LineEdge): LineEdge {
  const { iterationMax, ...rest } = edge;

  return iterationMax === undefined ? rest : edge;
}

interface Sources {
  recipes: Partial<Record<string, LoreRecipe>>;
  options: ConvertOptions;
  known: KnownLine;
}

function convertNode(line: LoreLine, node: LoreNode, sources: Sources): Converted {
  const start = node.by_hand ? { start: `manual.${line.name}.${node.id}` } : {};

  if (node.type === "retrospective" && node.id === line.exit) return { node: { id: node.id }, notes: [] };
  if (node.type === "agent") return agentNode(node, start, sources);

  return isHuman(node) ? humanNode(node, start) : serviceNode(node, start);
}

function humanNode(node: LoreNode, start: Pick<LineNode, "start">): Converted {
  const station = { id: stationIdOf(node), body: humanStationOf(node) };

  return { node: { id: node.id, station: station.id, ...start }, station, notes: [] };
}

function serviceNode(node: LoreNode, start: Pick<LineNode, "start">): Converted {
  const station = { id: stationIdOf(node), body: serviceStationOf() };

  return { node: { id: node.id, station: station.id, ...start }, station, notes: [serviceNote(node, station.id)] };
}

function agentNode(node: LoreNode, start: Pick<LineNode, "start">, sources: Sources): Converted {
  const recipe = sources.recipes[node.prompt_ref ?? ""];

  // A node lore started by hand is still started by hand with no recipe to run: dropping its start event would leave it unreachable and unstartable both.
  if (!recipe) return { node: { id: node.id, ...start }, notes: [`node "${node.id}": recipe "${node.prompt_ref}" was not found, so the node is a marker`] };
  const { delivers = {}, binds = {} } = sources.known;
  const told = deliveringOf(recipe, delivers[node.id]);
  const agentDefinition = { id: agentDefinitionIdOf(node, told, sources.options), body: agentDefinitionOf(node, told, sources.options) };
  const station = { id: stationIdOf(node), body: agentStationOf(node, told, agentDefinition.id) };

  return { node: { id: node.id, station: station.id, bind: { target: "repo", ...binds[node.id] }, ...start }, station, agentDefinition, notes: [] };
}

// The recipe as lore wrote it, unless its agent has something to deliver: then it is told how, and works in a repository it may write to.
function deliveringOf(recipe: LoreRecipe, instruction: string | undefined): LoreRecipe {
  if (!instruction) return recipe;

  return { ...recipe, prompt: `${recipe.prompt.trimEnd()}\n\n${instruction}\n`, settings: { ...recipe.settings, repo_workdir: true } };
}

function serviceNote(node: LoreNode, stationId: string): string {
  return `node "${node.id}": service station "${stationId}" has no needs or produces yet; what lore's job read and wrote is in its code, not in the line`;
}

function lineNotes(line: LoreLine, known: KnownLine): string[] {
  if (known !== UNKNOWN) return [];

  return [`line "${line.name}": nothing is known of what starts it or what lore's floor did around it; it has the default arguments and no start event`];
}

function uniqueById<Body>(named: Named<Body>[]): Named<Body>[] {
  return [...new Map(named.map((each) => [each.id, each])).values()];
}
