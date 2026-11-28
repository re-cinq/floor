// The fresh folder a local test run lives in, made inside the workspace the person picked, and how the JSON files in it are written.
import { mkdir, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { enforce } from "@re-cinq/floor-assembly-lines";

export async function createRunFolder(workspace: string, name: string): Promise<string> {
  enforceAbsolute(workspace, "the workspace folder");
  enforce(await isFolder(workspace), `the workspace folder ${workspace} is not a folder on disk`);

  return makeFirstFreeFolder(join(workspace, name), 1);
}

function makeFirstFreeFolder(wanted: string, attempt: number): Promise<string> {
  const candidate = attempt === 1 ? wanted : `${wanted}-${attempt}`;

  return mkdir(candidate).then(
    () => candidate,
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;

      return makeFirstFreeFolder(wanted, attempt + 1);
    },
  );
}

/** The text of a JSON file in a run folder: indented, one trailing newline. */
export function jsonFileText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function enforceAbsolute(path: string, folderName: string): void {
  enforce(isAbsolute(path), `${folderName} must be an absolute path, and ${JSON.stringify(path)} is not`);
}

export function isFolder(path: string): Promise<boolean> {
  return stat(path).then((found) => found.isDirectory(), () => false);
}
