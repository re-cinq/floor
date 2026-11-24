// Where the needs a node is tried with are kept: one JSON file for each node, in a dot folder the watcher ignores.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { storeFolderIn } from "./store-folder.js";

export function fixtureFilesIn(dir: string) {
  const fixtureFile = (line: string, node: string) => join(dir, ".floor-studio", "fixtures", line, `${node}.json`);

  const readFixture = async (line: string, node: string): Promise<Record<string, string>> =>
    readFile(fixtureFile(line, node), "utf8").then((text) => (JSON.parse(text) as { needs: Record<string, string> }).needs, () => ({}));

  const writeFixture = async (line: string, node: string, needs: Record<string, string>) => {
    await storeFolderIn(dir, "fixtures", line);
    await writeFile(fixtureFile(line, node), JSON.stringify({ needs }));
  };

  return { readFixture, writeFixture };
}
