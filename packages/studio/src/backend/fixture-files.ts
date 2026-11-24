// Where the needs a node is tried with are kept: one JSON file for each node, in a dot folder the watcher ignores.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export function fixtureFilesIn(dir: string) {
  const fixtureFile = (line: string, node: string) => join(dir, ".floor-studio", "fixtures", line, `${node}.json`);

  const readFixture = async (line: string, node: string): Promise<Record<string, string>> =>
    readFile(fixtureFile(line, node), "utf8").then((text) => (JSON.parse(text) as { needs: Record<string, string> }).needs, () => ({}));

  const writeFixture = async (line: string, node: string, needs: Record<string, string>) => {
    await mkdir(dirname(fixtureFile(line, node)), { recursive: true });
    await writeFile(fixtureFile(line, node), JSON.stringify({ needs }));
  };

  return { readFixture, writeFixture };
}
