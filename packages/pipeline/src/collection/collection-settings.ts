import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { enforce } from "./enforce.js";

/** The file at a collection's root that says what the collection expects of its host. */
export const COLLECTION_SETTINGS_FILE = "floor-collection.yaml";

export interface CollectionSettings {
  hostKeys: string[];
  groups: string[];
}

/** What the text of a `floor-collection.yaml` says: the frontmatter keys its host owns under `host_keys`, and the group folders under `groups`; empty for either left out. */
export function collectionSettingsOf(text: string): CollectionSettings {
  const settings = new Map(Object.entries((parse(text) as Record<string, unknown> | null) ?? {}));
  const hostKeys = settings.get("host_keys") ?? [];

  enforce(Array.isArray(hostKeys) && hostKeys.every((key) => typeof key === "string"), `${COLLECTION_SETTINGS_FILE}: host_keys is a list of names`);

  const groups = settings.get("groups") ?? [];

  enforce(isDistinctFolderNames(groups), `${COLLECTION_SETTINGS_FILE}: groups is a list of distinct folder names`);

  return { hostKeys, groups };
}

function isDistinctFolderNames(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((name) => typeof name === "string" && !name.includes("/")) && new Set(value).size === value.length;
}

/** The settings in a directory's `floor-collection.yaml`; empty without the file. */
export async function collectionSettingsIn(root: string): Promise<CollectionSettings> {
  return collectionSettingsOf(await readFile(join(root, COLLECTION_SETTINGS_FILE), "utf8").catch(() => ""));
}

/** The frontmatter keys the collection's host owns, as its `floor-collection.yaml` names them under `host_keys`; none without the file. */
export async function hostKeysIn(root: string): Promise<string[]> {
  return (await collectionSettingsIn(root)).hostKeys;
}
