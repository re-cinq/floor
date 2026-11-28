// Pure: how a run left in a workspace by an earlier studio is listed.
import type { RunSummary } from "./run-summary.js";
import type { TestRunListing } from "./test-run-state.js";

export function pastListingOf(folder: string, { line, startedAt, status, ending }: RunSummary): TestRunListing {
  const settled = status === "settled";

  return { run: folder, line, folder, status: settled ? status : "stopped", startedAt, ...(settled && ending && { ending }) };
}
