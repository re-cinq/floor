// A folder of pipeline files, applied in the order of their names, each once. The floor remembers which ran, and by what content: a file that ran is never run again, and one that ran and was since changed is refused, since what it did is done. A change is a new file.
import { createHash } from "node:crypto";
import { readPipelineFile } from "./file.js";
import { asked, type Floor } from "./floor.js";
import { importPipeline, type Put } from "./import.js";
import { pipelineOf } from "./shape.js";

export interface MigrationFile {
  name: string;
  text: string;
}

export interface Migrated {
  name: string;
  /** Empty for a file that had run before. */
  put: Put[];
  ran: boolean;
}

interface Remembered {
  body: { sha256: string };
}

export async function migrate(floor: Floor, files: MigrationFile[]): Promise<Migrated[]> {
  const ordered = files.toSorted((one, other) => one.name.localeCompare(other.name));
  const migrated: Migrated[] = [];

  for (const file of ordered) migrated.push(await applied(floor, file));

  return migrated;
}

async function applied(floor: Floor, file: MigrationFile): Promise<Migrated> {
  const sha256 = createHash("sha256").update(file.text).digest("hex");
  const remembered = await asked<Remembered>(floor, { method: "GET", path: `/migrations/${encodeURIComponent(file.name)}` });

  if (remembered) return alreadyRan(file, { sha256, ranAs: remembered.body.sha256 });
  const put = await importPipeline(floor, pipelineOf(readPipelineFile(file.text)));

  await asked(floor, { method: "PUT", path: `/migrations/${encodeURIComponent(file.name)}`, body: { sha256 } });

  return { name: file.name, put, ran: true };
}

function alreadyRan(file: MigrationFile, content: { sha256: string; ranAs: string }): Migrated {
  if (content.sha256 !== content.ranAs) throw new Error(`"${file.name}" has run, and has been changed since: what it did is done. Put the change in a new file`);

  return { name: file.name, put: [], ran: false };
}
