import { access } from "node:fs/promises";
import type { NeedPlacement } from "../run/workspace.js";

export async function absentSourceBlockers(placements: NeedPlacement[]): Promise<string[]> {
  const absent = await Promise.all(placements.map(async ({ need, from }) => (await isOnDisk(from) ? [] : [`"${need}": ${from} is not on disk`])));

  return absent.flat();
}

function isOnDisk(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}
