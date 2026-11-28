import type { Request } from "../protocol.js";
import { readLastTest } from "./last-tests.js";
import type { Handler } from "./requests.js";

export type TestLastRequest = Extract<Request, { type: "test.last" }>;

export const testLastHandler: Handler<TestLastRequest> = {
  type: "test.last",
  handle: async (context, { line }) => readLastTest(context.collectionDir, line),
};
