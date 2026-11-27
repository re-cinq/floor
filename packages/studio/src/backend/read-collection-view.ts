// How a collection folder becomes a CollectionView: its agent files, its settings, its skills and the host keys from both the caller and the settings.
import { basename, resolve } from "node:path";
import { collectionFilesIn, collectionSettingsIn, type CollectionFile } from "@re-cinq/floor-pipeline";
import type { CollectionView } from "../view.js";
import { collectionView, readLinesOf } from "./collection-view.js";
import { environmentOf } from "./environment-usage.js";
import type { ReadLine } from "./read-line.js";
import { isSkillPath, skillNamesIn } from "./skill-names.js";

export async function readCollectionView(dir: string, hostKeys: readonly string[]): Promise<CollectionView> {
  const { files, settings } = await gatheredFrom(dir);

  return { ...collectionView(files, [...hostKeys, ...settings.hostKeys], settings.groups), folder: basename(resolve(dir)), skills: await skillNamesIn(dir), environment: environmentOf(files) };
}

export async function readLinesIn(dir: string): Promise<ReadLine[]> {
  const { files, settings } = await gatheredFrom(dir);

  return readLinesOf(files, settings.hostKeys, settings.groups);
}

async function gatheredFrom(dir: string): Promise<{ files: CollectionFile[]; settings: Awaited<ReturnType<typeof collectionSettingsIn>> }> {
  const files = (await collectionFilesIn(dir)).filter((file) => !isSkillPath(file.path));

  return { files, settings: await collectionSettingsIn(dir) };
}
