// The timeline file of a local test run: one JSON entry per line, only ever appended to.
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { TimelineEntry } from "../test-run/timeline.js";

export const TIMELINE_FILE = "timeline.jsonl";

export function appendTimeline(runFolder: string, entry: TimelineEntry): Promise<void> {
  return appendFile(join(runFolder, TIMELINE_FILE), `${JSON.stringify(entry)}\n`);
}
