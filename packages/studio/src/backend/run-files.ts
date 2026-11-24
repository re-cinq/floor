// Where the runs are kept: one JSON file for each run, so a restarted studio can still read its transcript.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunTranscript } from "../run/run-records.js";
import { storeFolderIn } from "./store-folder.js";

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function runFilesIn(dir: string) {
  const writeRun = async (run: string, { lines, ended }: RunTranscript): Promise<void> => {
    await writeFile(join(await storeFolderIn(dir, "runs"), `${run}.json`), JSON.stringify({ lines, ended }));
  };

  const readRun = async (run: string): Promise<RunTranscript | undefined> =>
    RUN_ID.test(run)
      ? readFile(join(dir, ".floor-studio", "runs", `${run}.json`), "utf8").then((text) => JSON.parse(text) as RunTranscript, () => undefined)
      : undefined;

  return { writeRun, readRun };
}
