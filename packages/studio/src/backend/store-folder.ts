// The dot folder the studio keeps its own files in, ignored by git from the first write.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function storeFolderIn(dir: string, ...parts: string[]): Promise<string> {
  const store = join(dir, ".floor-studio");

  await mkdir(join(store, ...parts), { recursive: true });
  await writeFile(join(store, ".gitignore"), "*", { flag: "wx" }).catch(() => undefined);

  return join(store, ...parts);
}
