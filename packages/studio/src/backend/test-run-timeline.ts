// The timeline file of a local test run: one JSON entry per line, only ever appended to.
import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunSummary } from "../test-run/run-summary.js";
import type { TimelineEntry } from "../test-run/timeline.js";
import { jsonFileText } from "./test-run-folder.js";

export const TIMELINE_FILE = "timeline.jsonl";
export const RUN_FILE = "run.json";

export function appendTimeline(runFolder: string, entry: TimelineEntry): Promise<void> {
  return appendFile(join(runFolder, TIMELINE_FILE), `${JSON.stringify(entry)}\n`);
}

export function writeRunSummary(runFolder: string, summary: RunSummary): Promise<void> {
  return writeFile(join(runFolder, RUN_FILE), jsonFileText(summary));
}
