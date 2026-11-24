// The environment a collection asks for: each `${NAME}` its line files and its agents' settings name, and where. A prompt is never filled, so an agent file counts by its frontmatter alone.
import { agentFileOf, pipelineFolderOf, placeholdersIn, type CollectionFile } from "@re-cinq/floor-pipeline";

const FRONTMATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;

export function environmentOf(files: readonly CollectionFile[]): { name: string; files: string[] }[] {
  const filesByName = new Map<string, string[]>();
  const uses = files.flatMap(({ path, text }) => placeholdersIn(filledTextOf(path, text)).map((name) => ({ name, path })));

  uses.forEach(({ name, path }) => filesByName.set(name, [...(filesByName.get(name) ?? []), path]));

  return [...filesByName]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, named]) => ({ name, files: named.sort() }));
}

function filledTextOf(path: string, text: string): string {
  if (pipelineFolderOf(path)) return text;
  if (agentFileOf(path)) return FRONTMATTER.exec(text)?.[1] ?? "";

  return "";
}
