// Builds the kernel's WalkGraph from a line body: each node's kind comes from the station it points at, resolved once per next() call.

import type { WalkGraph, WalkEdge } from "@floor/assembly-lines";
import type { DefinitionsStore } from "./definitions.js";
import type { LineBody, StationBody } from "./types.js";

export async function buildWalkGraph(
  definitions: DefinitionsStore,
  lineName: string,
  line: LineBody,
): Promise<WalkGraph> {
  const nodes = await Promise.all(line.nodes.map((node) => walkNodeOf(definitions, node)));

  return { name: lineName, entry: line.entry, exit: line.exit, fail: line.fail, edges: edgesOf(line), nodes };
}

function edgesOf(line: LineBody): WalkEdge[] {
  return line.edges.map((edge) => ({ from: edge.from, to: edge.to, on: edge.on, iterationMax: edge.iterationMax }));
}

async function walkNodeOf(
  definitions: DefinitionsStore,
  node: LineBody["nodes"][number],
): Promise<{ id: string; kind?: "agent" | "service" | "human" }> {
  if (!node.station) return { id: node.id };

  const station = await stationOf(definitions, node.station);

  return { id: node.id, kind: station?.kind };
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
