// A collection, put to a floor: its agents first, then each line with its stations, since the floor refuses a station naming an agent it does not have. Putting the same collection twice changes nothing.
import { asked, type Floor } from "../floor.js";
import { importPipeline, type Put } from "../import.js";
import { pipelineOf, type Fields, type Named, type Pipeline } from "../shape.js";
import type { OverlayAgent } from "./agents.js";
import type { CollectionOverlay } from "./collection.js";

const NOTHING_ELSE = { files: {}, stations: [], schedules: [], archive: { lines: [], stations: [], agentDefinitions: [], schedules: [] } };

export async function applyCollection(floor: Floor, overlay: Pick<CollectionOverlay, "agents" | "pipelines">): Promise<Put[]> {
  const agentDefinitions = agentDefinitionsOf(overlay.agents, await heldDefinitions(floor, [...overlay.agents.keys()]));
  const agents = await importPipeline(floor, { ...NOTHING_ELSE, agentDefinitions });
  const lines: Put[] = [];

  // One after another, in the order of their folders: a line may name a station an earlier folder defines.
  for (const pipeline of overlay.pipelines) lines.push(...(await importPipeline(floor, withoutAgents(pipeline))));

  return [...agents, ...lines];
}

/** Each agent's settings as the floor spells them, over what the floor holds for it: a collection sets an agent's settings, and a repository's variant is not its to take away. */
export function agentDefinitionsOf(agents: ReadonlyMap<string, OverlayAgent>, held: ReadonlyMap<string, Fields>): Named[] {
  const written = Object.fromEntries([...agents].map(([name, agent]) => [name, { settings: agent.settings }]));

  return pipelineOf({ agent_definitions: written }).agentDefinitions.map(({ id, body }) => ({ id, body: { ...held.get(id), settings: body.settings } }));
}

function withoutAgents(pipeline: Pipeline): Pipeline {
  return { ...pipeline, agentDefinitions: [] };
}

async function heldDefinitions(floor: Floor, names: string[]): Promise<Map<string, Fields>> {
  const rows = await Promise.all(names.map(async (name) => asked<{ body: Fields }>(floor, { method: "GET", path: `/agent-definitions/${name}` })));

  return new Map(names.flatMap((name, index) => (rows[index] ? [[name, rows[index].body]] : [])));
}
