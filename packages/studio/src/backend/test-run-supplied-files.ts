// The files a person supplies for a stand-in visit: picked ones must exist on disk before the report is accepted.
import { statSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { StationBody } from "@re-cinq/floor-contracts";
import { enforce } from "@re-cinq/floor-assembly-lines";
import { enforceAbsolute } from "./test-run-folder.js";
import { leavesFolder } from "../run/run-preview.js";
import type { SuppliedFile } from "../test-run/stand-in-report.js";

export function enforcePickedFilesOnDisk(files: Readonly<Record<string, SuppliedFile>>): void {
  for (const [name, file] of Object.entries(files)) {
    if (!("picked" in file)) continue;

    const { picked } = file;

    enforceAbsolute(picked, `${name}: the picked file`);
    const stats = statSync(picked, { throwIfNoEntry: false });

    enforce(stats !== undefined, `${name}: the picked file ${picked} is not on disk`);
    enforce(stats.isFile(), `${name}: the picked file ${picked} is not a file`);
  }
}

export function suppliedTargets(station: StationBody, files: Readonly<Record<string, SuppliedFile>>, outputsFolder: string): Record<string, string> {
  const { produces } = station;
  const targets = Object.keys(files).map((name) => {
    const path = produces.find((output) => output.name === name)?.path ?? name;

    enforce(!leavesFolder(outputsFolder, path), `"${name}": ${path} leaves the visit's outputs folder`);

    return [name, join(outputsFolder, path)] as const;
  });

  return Object.fromEntries(targets);
}

export async function writeSuppliedFiles(targets: Readonly<Record<string, string>>, files: Readonly<Record<string, SuppliedFile>>): Promise<void> {
  await Promise.all(
    Object.entries(targets).map(async ([name, target]) => {
      const file = files[name];

      await mkdir(dirname(target), { recursive: true });
      await ("picked" in file ? copyFile(file.picked, target) : writeFile(target, file.pasted));
    }),
  );
}
