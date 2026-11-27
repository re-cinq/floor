import type { Request } from "../protocol.js";
import type { TestRunListing } from "../test-run/test-run-state.js";
import type { Handler } from "./requests.js";
import type { TestRunSession } from "./test-run-session.js";

export type TestListRequest = Extract<Request, { type: "test.list" }>;

export function listingOf({ id, startedAt, state }: TestRunSession): TestRunListing {
  const { lineId, folder, status, ending } = state();

  return { run: id, line: lineId, folder, status, startedAt, ...(ending && { ending }) };
}

export const testListHandler: Handler<TestListRequest> = {
  type: "test.list",
  handle: async (context) => [...context.testRuns.values()].map(listingOf).sort((first, second) => second.startedAt.localeCompare(first.startedAt)),
};
