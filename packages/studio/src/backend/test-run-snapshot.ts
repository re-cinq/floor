// The copy of a collection's definitions a local test run keeps, so later edits never reach a run in flight.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { COLLECTION_SETTINGS_FILE, collectionFilesIn } from "@re-cinq/floor-pipeline";

export const SNAPSHOT_FOLDER = "definitions";

interface SnapshotFile {
  path: string;
  text: string;
}

export async function snapshotCollection(collectionDir: string, runFolder: string): Promise<string[]> {
  const files = [...(await collectionFilesIn(collectionDir)), ...(await settingsFileIn(collectionDir))];

  await Promise.all(files.map(({ path, text }) => writeSnapshotFile(join(runFolder, SNAPSHOT_FOLDER, path), text)));

  return files.map(({ path }) => path).sort();
}

async function writeSnapshotFile(target: string, text: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text);
}

function settingsFileIn(collectionDir: string): Promise<SnapshotFile[]> {
  return readFile(join(collectionDir, COLLECTION_SETTINGS_FILE), "utf8").then((text) => [{ path: COLLECTION_SETTINGS_FILE, text }], () => []);
}
