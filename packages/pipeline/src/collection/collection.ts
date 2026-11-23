// A collection: one folder a line, holding `assembly-line.yaml` and `agents/<agent>.md`. What the host ships and what the collection supplies, combined in memory with no floor in reach.
import type { Pipeline } from "../shape.js";
import { agentsOverlay, type CollectionOverlayInput, type OverlayAgent } from "./agents.js";
import { pipelinesOverlay } from "./pipelines.js";
import { isReadPath } from "./paths.js";
import type { Refusal } from "./refusal.js";

export type { AgentSource, CollectionOverlayInput, OverlayAgent, ShippedCatalog } from "./agents.js";
export type { CollectionFile } from "./paths.js";
export type { Refusal } from "./refusal.js";

export interface CollectionOverlay {
  agents: Map<string, OverlayAgent>;
  pipelines: Pipeline[];
  counts: { agents: number; pipelines: number; extensions: number };
  refused: Refusal[];
}

export function collectionOverlay(input: CollectionOverlayInput): CollectionOverlay {
  const agentsSet = agentsOverlay(input);
  const pipelinesSet = pipelinesOverlay(input, agentsSet.agents);
  const { agents } = agentsSet;
  const { pipelines } = pipelinesSet;

  return {
    agents,
    pipelines,
    refused: byPath([...agentsSet.refused, ...pipelinesSet.refused, ...unreadPathsOf(input)]),
    counts: { agents: agents.size, pipelines: pipelines.length, extensions: extensionsIn(agents) },
  };
}

function extensionsIn(agents: CollectionOverlay["agents"]): number {
  return [...agents.values()].filter((agent) => agent.source === "extended").length;
}

const UNREAD_PATH = "a collection does not read this path: a line folder holds assembly-line.yaml, agents/<agent>.md and agents/<agent>.extra.md";

/** A file in a line folder that would be skipped in silence: a misspelt name must show, not quietly do nothing. */
function unreadPathsOf({ files }: CollectionOverlayInput): Refusal[] {
  const unread = files.filter((file) => !isReadPath(file.path));

  return unread.map((file) => ({ path: file.path, reason: UNREAD_PATH }));
}

function byPath(refused: Refusal[]): Refusal[] {
  return refused.sort((left, right) => left.path.localeCompare(right.path));
}
