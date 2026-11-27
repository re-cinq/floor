// Builds the kernel's WalkGraph from a line body: each distinct station's kind is fetched once per next() call.

import { walkGraphOf, type WalkGraph } from "@re-cinq/floor-assembly-lines";
import type { DefinitionsStore } from "./definitions.js";
import type { LineBody, StationBody } from "./types.js";

export async function buildWalkGraph(
  definitions: DefinitionsStore,
  lineName: string,
  line: LineBody,
): Promise<WalkGraph> {
  const kindByRef = await kindOfEachStation(definitions, line);

  return walkGraphOf(lineName, line, (ref) => kindByRef.get(ref));
}

async function kindOfEachStation(
  definitions: DefinitionsStore,
  line: LineBody,
): Promise<Map<string, StationBody["kind"] | undefined>> {
  const refs = new Set(line.nodes.flatMap((node) => (node.station ? [node.station] : [])));
  const entries = await Promise.all([...refs].map((ref) => kindOfStation(definitions, ref)));

  return new Map(entries);
}

async function kindOfStation(definitions: DefinitionsStore, ref: string) {
  const station = await stationOf(definitions, ref);

  return [ref, station?.kind] as const;
}

async function stationOf(definitions: DefinitionsStore, ref: string): Promise<StationBody | null> {
  const [id, hash] = ref.split("@");

  if (hash) {
    const row = await definitions.byHash<StationBody>("station", id!, hash);

    return row?.body ?? null;
  }

  const row = await definitions.latest<StationBody>("station", id!);

  return row?.body ?? null;
}
