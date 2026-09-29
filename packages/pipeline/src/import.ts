// A pipeline, put to a floor: what a line names first, then the line, since the floor refuses a line naming a station it does not have. Putting the same thing twice changes nothing; a version is its content.
import { asked, blobStored, type Floor } from "./floor.js";
import type { Named, Pipeline } from "./shape.js";

export interface Put {
  /** The floor's route: `stations`, say. */
  kind: string;
  id: string;
  /** False for a version the floor already had. */
  changed: boolean;
}

export async function importPipeline(floor: Floor, pipeline: Pipeline): Promise<Put[]> {
  const files = await filesStored(floor, pipeline.files);
  const agentDefinitions = await allPut(floor, "agent-definitions", pipeline.agentDefinitions);
  const stations = await allPut(floor, "stations", pipeline.stations);
  const lines = await allPut(floor, "assembly-lines", linesOf(pipeline, files));
  const schedules = await allPut(floor, "schedules", pipeline.schedules);

  return [...agentDefinitions, ...stations, ...lines, ...schedules, ...(await archived(floor, pipeline))];
}

function linesOf(pipeline: Pipeline, files: Record<string, string>): Named[] {
  const line = pipeline.line;

  if (!line) return [];
  const named = Object.keys(files).length > 0 ? { files } : {};

  return [{ id: line.id, body: { ...line.body, ...named } }];
}

async function filesStored(floor: Floor, files: Pipeline["files"]): Promise<Record<string, string>> {
  const stored = await Promise.all(Object.entries(files).map(async ([name, bytes]) => [name, await blobStored(floor, bytes)]));

  return Object.fromEntries(stored) as Record<string, string>;
}

function allPut(floor: Floor, kind: string, named: Named[]): Promise<Put[]> {
  return Promise.all(named.map((each) => put(floor, kind, each)));
}

async function put(floor: Floor, kind: string, named: Named): Promise<Put> {
  const answer = await asked<{ created: boolean }>(floor, { method: "POST", path: `/${kind}`, body: { id: named.id, ...named.body } });

  return { kind, id: named.id, changed: answer?.created ?? true };
}

// A line goes before what it named: the floor keeps a station a line still names.
async function archived(floor: Floor, pipeline: Pipeline): Promise<Put[]> {
  const { lines, stations, agentDefinitions, schedules } = pipeline.archive;
  const gone = [...kindOf("assembly-lines", lines), ...kindOf("schedules", schedules), ...kindOf("stations", stations), ...kindOf("agent-definitions", agentDefinitions)];

  for (const each of gone) await asked(floor, { method: "DELETE", path: `/${each.kind}/${each.id}` });

  return gone;
}

function kindOf(kind: string, ids: string[]): Put[] {
  return ids.map((id) => ({ kind, id, changed: true }));
}
