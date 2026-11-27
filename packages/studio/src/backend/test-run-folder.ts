// The fresh folder a local test run lives in, made inside the workspace the person picked.
import { mkdir, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { enforce } from "@re-cinq/floor-assembly-lines";

export async function createRunFolder(workspace: string, name: string): Promise<string> {
  enforce(isAbsolute(workspace), `the workspace folder must be an absolute path, and ${JSON.stringify(workspace)} is not`);
  enforce(await isFolder(workspace), `the workspace folder ${workspace} is not a folder on disk`);

  const runFolder = join(workspace, name);

  await mkdir(runFolder).catch((error: NodeJS.ErrnoException) => {
    enforce(error.code !== "EEXIST", `${runFolder} already exists, and a test run never reuses a folder`);
    throw error;
  });

  return runFolder;
}

function isFolder(path: string): Promise<boolean> {
  return stat(path).then((found) => found.isDirectory(), () => false);
}
