// The overlay of a collection on a local directory, and the lines a lint prints about it: no floor, no network.
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { agentsOverlay, type ShippedCatalog } from "./agents.js";
import { collectionOverlay, type CollectionOverlay } from "./collection.js";
import { enforce } from "./enforce.js";
import type { Environment } from "./environment.js";
import { isCollectionFile, pipelineFolderOf, type CollectionFile } from "./paths.js";

/** Stands in for the install's environment: whether a variable is set there is not the collection's to know. */
const ANY_ENVIRONMENT_VARIABLE = new Proxy<Record<string, string | undefined>>({}, { get: (variables, name) => `${String(name)}-for-lint` });

/** Nothing is shipped: a collection is checked on its own. */
const NOTHING_SHIPPED: ShippedCatalog = { pipelines: [], agents: new Map() };

export async function lintCollectionDirectory(root: string, hostKeys: readonly string[] = [], shipped: ShippedCatalog = NOTHING_SHIPPED): Promise<CollectionOverlay> {
  return readCollectionDirectory(root, { hostKeys, env: ANY_ENVIRONMENT_VARIABLE, shipped });
}

/** The collection in a directory, with `${NAME}` filled from the environment given. Nothing is shipped unless a catalog is given. */
export async function readCollectionDirectory(root: string, given: { hostKeys: readonly string[]; env: Environment; shipped?: ShippedCatalog }): Promise<CollectionOverlay> {
  return collectionOverlay({ files: await collectionFilesIn(root), ...given, shipped: given.shipped ?? NOTHING_SHIPPED });
}

/** The catalog a directory laid out as a collection stands for: the lines and the agents it holds are the ones shipped. */
export async function shippedCatalogIn(root: string, hostKeys: readonly string[] = []): Promise<ShippedCatalog> {
  const files = await collectionFilesIn(root);
  const { agents, refused } = agentsOverlay({ files, shipped: NOTHING_SHIPPED, env: ANY_ENVIRONMENT_VARIABLE, hostKeys });

  enforce(refused.length === 0, refused.map(({ path, reason }) => `${path}: ${reason}`).join("\n"));
  const folders = files.flatMap((file) => pipelineFolderOf(file.path) ?? []);

  return { pipelines: [...new Set(folders)], agents: new Map([...agents].map(([name, agent]) => [name, agent.settings])) };
}

export interface LintCommand {
  directory?: string;
  hostKeys: readonly string[];
  /** A directory in the layout of a collection, holding what the host ships. */
  shippedDirectory?: string;
}

/** The `lint` command: the exit code is 0 clean, 1 refused, 2 when the call is wrong. */
export async function lintCommand(given: LintCommand, usage: string, output: { out: (line: string) => void; err: (line: string) => void }): Promise<number> {
  if (!given.directory) {
    output.err(usage);

    return 2;
  }

  const shipped = given.shippedDirectory ? await shippedCatalogIn(given.shippedDirectory, given.hostKeys) : undefined;

  return printCollectionLint(given.directory, given.hostKeys, output.out, shipped);
}

/** Prints the refused files and answers the exit code: 0 clean, 1 refused. */
export async function printCollectionLint(root: string, hostKeys: readonly string[], print: (line: string) => void, shipped: ShippedCatalog = NOTHING_SHIPPED): Promise<number> {
  const { refused, counts } = await lintCollectionDirectory(root, hostKeys, shipped);

  for (const { path, reason } of refused) print(`${path}: ${reason}`);
  if (refused.length > 0) return 1;
  print(`collection ok: ${counts.agents} agents, ${counts.pipelines} pipelines, ${counts.extensions} extensions`);

  return 0;
}

/** The files of a collection on disk, each with its path from the root: the ones a collection reads or refuses. */
export async function collectionFilesIn(root: string): Promise<CollectionFile[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const paths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .filter((path) => isCollectionFile(path) && !path.startsWith(".git/"));

  return Promise.all(paths.map(async (path) => ({ path, text: await readFile(join(root, path), "utf8") })));
}
