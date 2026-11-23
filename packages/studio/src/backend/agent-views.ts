import type { CollectionFile, OverlayAgent } from "@re-cinq/floor-pipeline";
import { agentFileOf } from "@re-cinq/floor-pipeline";
import { present } from "./present.js";
import type { AgentUse, AgentView, LineView } from "../view.js";

export interface AgentFiles {
  file?: string;
  extraFile?: string;
}

export function agentViews(agents: ReadonlyMap<string, OverlayAgent>, filesOf: ReadonlyMap<string, AgentFiles>, lines: readonly LineView[]): AgentView[] {
  return [...agents]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, { source, settings }]) => {
      const { prompt, ...written } = settings;
      const { file = "", extraFile } = filesOf.get(name) ?? {};

      return { name, file, ...present({ extraFile }), source, settings: written, prompt, usedBy: usesOf(name, lines) };
    });
}

export function agentFilesByName(files: readonly CollectionFile[]): Map<string, AgentFiles> {
  const byName = new Map<string, AgentFiles>();

  for (const { path } of files) {
    const named = agentFileOf(path);

    if (named) byName.set(named.agent, { ...byName.get(named.agent), [named.isExtension ? "extraFile" : "file"]: path });
  }

  return byName;
}

function usesOf(agent: string, lines: readonly LineView[]): AgentUse[] {
  return lines.flatMap((line) => usesInLine(agent, line));
}

function usesInLine(agent: string, { id, nodes }: LineView): AgentUse[] {
  const using = nodes.filter((node) => node.agent?.name === agent);

  return using.map((node) => ({ line: id, node: node.id }));
}
