// The values each line was last tested with, kept per collection in the user's config folder.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface LastTest {
  workspace: string;
  entered: Record<string, string>;
}

interface RememberedTest extends LastTest {
  workspaces?: string[];
}

type LastTests = Partial<Record<string, Partial<Record<string, RememberedTest>>>>;

export async function readLastTest(collectionDir: string, line: string): Promise<LastTest | null> {
  const remembered = (await readLastTests())[collectionDir]?.[line];

  return remembered ? { workspace: remembered.workspace, entered: remembered.entered } : null;
}

export async function rememberedWorkspaces(collectionDir: string): Promise<{ line: string; workspace: string }[]> {
  const lines = (await readLastTests())[collectionDir] ?? {};

  return Object.entries(lines).flatMap(([line, remembered]) => (remembered?.workspaces ?? []).map((workspace) => ({ line, workspace })));
}

export async function rememberLastTest(collectionDir: string, line: string, lastTest: LastTest): Promise<void> {
  const file = lastTestsFile();

  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(withLastTest(await readLastTests(), collectionDir, line, lastTest)));
}

function withLastTest(all: LastTests, collectionDir: string, line: string, lastTest: LastTest): LastTests {
  const previous = all[collectionDir]?.[line];
  const used = previous?.workspaces ?? [];
  const workspaces = used.includes(lastTest.workspace) ? used : [...used, lastTest.workspace];

  return { ...all, [collectionDir]: { ...all[collectionDir], [line]: { ...lastTest, workspaces } } };
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
