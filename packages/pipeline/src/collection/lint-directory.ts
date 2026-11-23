// The overlay of a collection on a local directory, and the lines a lint prints about it: no floor, no network.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { collectionOverlay, type CollectionOverlay } from "./collection.js";
import { isCollectionFile, type CollectionFile } from "./paths.js";

/** Stands in for the install's environment: whether a variable is set there is not the collection's to know. */
const ANY_ENVIRONMENT_VARIABLE = new Proxy<Record<string, string | undefined>>({}, { get: (variables, name) => `${String(name)}-for-lint` });

/** Nothing is shipped: a collection is checked on its own. */
const NOTHING_SHIPPED = { pipelines: [], agents: new Map() };

export async function lintCollectionDirectory(root: string, hostKeys: readonly string[] = []): Promise<CollectionOverlay> {
  return collectionOverlay({ files: await collectionFilesIn(root), shipped: NOTHING_SHIPPED, env: ANY_ENVIRONMENT_VARIABLE, hostKeys });
}

/** Prints the refused files and answers the exit code: 0 clean, 1 refused. */
export async function printCollectionLint(root: string, hostKeys: readonly string[], print: (line: string) => void): Promise<number> {
  const { refused, counts } = await lintCollectionDirectory(root, hostKeys);

  for (const { path, reason } of refused) print(`${path}: ${reason}`);
  if (refused.length > 0) return 1;
  print(`collection ok: ${counts.agents} agents, ${counts.pipelines} pipelines, ${counts.extensions} extensions`);

  return 0;
}

async function collectionFilesIn(root: string): Promise<CollectionFile[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const paths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length).replace(/^[\\/]+/, "").split("\\").join("/"))
    .filter((path) => isCollectionFile(path) && !path.startsWith(".git/"));

  return Promise.all(paths.map(async (path) => ({ path, text: await readFile(join(root, path), "utf8") })));
}
