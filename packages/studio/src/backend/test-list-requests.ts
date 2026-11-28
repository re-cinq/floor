import type { Request } from "../protocol.js";
import type { TestRunListing } from "../test-run/test-run-state.js";
import { pastTestRuns } from "./past-test-runs.js";
import type { Handler } from "./requests.js";
import type { TestRunSession } from "./test-run-session.js";

export type TestListRequest = Extract<Request, { type: "test.list" }>;

export function listingOf({ id, startedAt, state }: TestRunSession): TestRunListing {
  const { lineId, folder, status, ending } = state();

  return { run: id, line: lineId, folder, status, startedAt, ...(ending && { ending }) };
}

export const testListHandler: Handler<TestListRequest> = {
  type: "test.list",
  handle: async (context) => {
    const live = [...context.testRuns.values()].map(listingOf);
    const liveFolders = new Set(live.map(({ folder }) => folder));
    const past = (await pastTestRuns(context.collectionDir)).filter(({ folder }) => !liveFolders.has(folder));

    return [...live, ...past].sort((first, second) => second.startedAt.localeCompare(first.startedAt));
  },
};
