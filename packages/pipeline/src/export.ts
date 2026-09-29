// A pipeline, read from a floor: a line's latest version with everything it needs to run on another floor, or on this one after it is lost. A file is read whole, its content and not its hash: a hash is no backup.
import { asked, blobRead, type Floor } from "./floor.js";
import type { Fields, Named, Pipeline } from "./shape.js";

const SCHEDULE_TICK = /^schedule\.(.+)\.tick$/;

interface Row {
  id: string;
  body: Fields;
}

export async function lineIds(floor: Floor): Promise<string[]> {
  const listed = await asked<{ items: Row[] }>(floor, { method: "GET", path: "/assembly-lines" });

  return (listed?.items ?? []).map((row) => row.id);
}

export async function exportPipeline(floor: Floor, lineId: string): Promise<Pipeline> {
  const line = await named(floor, "assembly-lines", lineId);
  const { files = {}, ...body } = line.body as Fields & { files?: Record<string, string> };
  const stations = await allNamed(floor, "stations", stationsOf(body));
  const agentDefinitions = await allNamed(floor, "agent-definitions", namesIn(stations.map((station) => station.body.agentDefinition)));

  return {
    line: { id: line.id, body },
    files: await filesRead(floor, files),
    stations,
    agentDefinitions,
    schedules: await allNamed(floor, "schedules", schedulesOf(body)),
    archive: { lines: [], stations: [], agentDefinitions: [], schedules: [] },
  };
}

// A node may pin a station's version, `name@hash`; the file carries the station by its name.
function stationsOf(line: Fields): string[] {
  const nodes = (line.nodes ?? []) as { station?: string }[];
  const named = nodes.map((node) => node.station ?? "");

  return namesIn(named.map((station) => station.split("@")[0]));
}

// A line a schedule starts names the schedule's tick as what starts it.
function schedulesOf(line: Fields): string[] {
  const start = (line.start ?? {}) as { on?: string[] };
  const ticks = (start.on ?? []).map((event) => SCHEDULE_TICK.exec(event)?.[1]);

  return namesIn(ticks);
}

function namesIn(held: unknown[]): string[] {
  const names = held.filter((name): name is string => typeof name === "string" && name.length > 0);

  return [...new Set(names)];
}

function allNamed(floor: Floor, kind: string, ids: string[]): Promise<Named[]> {
  return Promise.all(ids.map((id) => named(floor, kind, id)));
}

async function named(floor: Floor, kind: string, id: string): Promise<Named> {
  const row = await asked<Row>(floor, { method: "GET", path: `/${kind}/${id}` });

  if (!row) throw new Error(`the floor has no ${kind} "${id}"`);

  return { id: row.id, body: row.body };
}

async function filesRead(floor: Floor, files: Record<string, string>): Promise<Record<string, Buffer>> {
  const read = await Promise.all(Object.entries(files).map(async ([name, hash]) => [name, await blobRead(floor, hash)]));

  return Object.fromEntries(read) as Record<string, Buffer>;
}
