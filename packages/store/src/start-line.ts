// Which version of a line a run starts on, and whether what that version ships is still there. Both answered before a run exists, so a start that cannot work is refused rather than written down.
import type { Pool } from "pg";
import type { LineBody } from "./types.js";
import type { DefinitionRow, DefinitionsStore } from "./definitions.js";
import { enforce } from "./refusal.js";
import { blobHashesExist } from "./sql.js";

export interface LineWanted {
  lineId: string;
  /** Absent: the latest version, which is what almost every start wants. */
  lineHash?: string;
}

export async function lineToStart(definitions: DefinitionsStore, wanted: LineWanted): Promise<DefinitionRow<LineBody>> {
  if (wanted.lineHash === undefined) {
    const latest = await definitions.latest<LineBody>("line", wanted.lineId);

    enforce(latest, `no line named "${wanted.lineId}"`);

    return latest;
  }

  const pinned = await definitions.byHash<LineBody>("line", wanted.lineId, wanted.lineHash);

  enforce(pinned, `"${wanted.lineHash}" is not a version of line "${wanted.lineId}"`);
  // Archiving retires a line, and naming a version by hand must not walk around that.
  enforce(!pinned.archivedAt, `line "${wanted.lineId}" is archived`);

  return pinned;
}

export async function enforceFilesExist(pool: Pool, files: Record<string, string> | undefined): Promise<void> {
  if (!files || Object.keys(files).length === 0) return;
  const existing = await blobHashesExist(pool, Object.values(files));

  for (const [name, hash] of Object.entries(files)) {
    enforce(existing.has(hash), `file "${name}" names blob "${hash}", which does not exist`);
  }
}
