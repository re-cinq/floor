// The runs earlier studios left in the workspaces a collection's lines were tested in.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunSummary } from "../test-run/run-summary.js";
import { pastListingOf } from "../test-run/past-listing.js";
import type { TestRunListing } from "../test-run/test-run-state.js";
import { rememberedWorkspaces } from "./last-tests.js";
import { RUN_FILE } from "./test-run-timeline.js";

export async function pastTestRuns(collectionDir: string): Promise<TestRunListing[]> {
  const remembered = await rememberedWorkspaces(collectionDir);
  const found = await Promise.all(remembered.map(({ line, workspace }) => runsOf(line, workspace)));

  return found.flat();
}

async function runsOf(line: string, workspace: string): Promise<TestRunListing[]> {
  const entries = await readdir(workspace, { withFileTypes: true }).catch(() => []);
  const folders = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith(`${line}-`)).map((entry) => join(workspace, entry.name));
  const listings = await Promise.all(folders.map(listingIn));

  return listings.filter((listing) => listing !== null).filter((listing) => listing.line === line);
}

async function listingIn(folder: string): Promise<TestRunListing | null> {
  const raw = await readFile(join(folder, RUN_FILE), "utf8").catch(() => undefined);
  const summary = raw === undefined ? null : parseSummary(raw);

  return summary && pastListingOf(folder, summary);
}

function parseSummary(raw: string): RunSummary | null {
  try {
    return JSON.parse(raw) as RunSummary;
  } catch {
    return null;
  }
}
