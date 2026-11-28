// Reads a past test run's state back from its folder: run.json, timeline.jsonl and visits/*/visit.json.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pastStateOf } from "../test-run/past-state.js";
import type { RunSummary } from "../test-run/run-summary.js";
import type { TestRunState } from "../test-run/test-run-state.js";
import type { TimelineEntry } from "../test-run/timeline.js";
import type { VisitRecord } from "../test-run/visit-record.js";
import { pastTestRuns } from "./past-test-runs.js";
import { RUN_FILE, TIMELINE_FILE } from "./test-run-timeline.js";
import { visitFolderOf } from "./test-run-visit-files.js";

export async function readPastRun(collectionDir: string, folder: string): Promise<TestRunState | undefined> {
  const known = (await pastTestRuns(collectionDir)).some((listing) => listing.folder === folder);

  return known ? stateIn(folder) : undefined;
}

async function stateIn(folder: string): Promise<TestRunState> {
  const summary = JSON.parse(await readFile(join(folder, RUN_FILE), "utf8")) as RunSummary;
  const timeline = (await readFile(join(folder, TIMELINE_FILE), "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line) as TimelineEntry);
  const ids = await readdir(join(folder, "visits")).catch(() => []);
  const records = await Promise.all(ids.map(async (id) => JSON.parse(await readFile(join(visitFolderOf(folder, id), "visit.json"), "utf8").catch(() => "null")) as VisitRecord | null));

  return pastStateOf(folder, summary, timeline, Object.fromEntries(records.filter((record) => record !== null).map((record) => [record.id, record])));
}
