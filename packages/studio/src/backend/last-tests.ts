// The values each line was last tested with, kept per collection in the user's config folder.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface LastTest {
  workspace: string;
  entered: Record<string, string>;
}

type LastTests = Partial<Record<string, Partial<Record<string, LastTest>>>>;

export async function readLastTest(collectionDir: string, line: string): Promise<LastTest | null> {
  return (await readLastTests())[collectionDir]?.[line] ?? null;
}

export async function rememberLastTest(collectionDir: string, line: string, lastTest: LastTest): Promise<void> {
  const file = lastTestsFile();

  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(withLastTest(await readLastTests(), collectionDir, line, lastTest)));
}

function withLastTest(all: LastTests, collectionDir: string, line: string, lastTest: LastTest): LastTests {
  return { ...all, [collectionDir]: { ...all[collectionDir], [line]: lastTest } };
}

async function readLastTests(): Promise<LastTests> {
  const raw = await readFile(lastTestsFile(), "utf8").catch(() => undefined);

  return raw ? parseLastTests(raw) : {};
}

function parseLastTests(raw: string): LastTests {
  try {
    return (JSON.parse(raw) as LastTests | null) ?? {};
  } catch {
    return {};
  }
}

function lastTestsFile(): string {
  const configFolder = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");

  return join(configFolder, "floor-studio", "last-tests.json");
}
