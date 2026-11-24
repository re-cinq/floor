// The request that reads a run's transcript from a line on, while it runs or after it ended.
import { enforce } from "@re-cinq/floor-assembly-lines";
import type { Request } from "../protocol.js";
import { readRecord } from "../run/run-records.js";
import type { Handler } from "./requests.js";

export type RunReadRequest = Extract<Request, { type: "run.read" }>;

export const runReadHandler: Handler<RunReadRequest> = {
  type: "run.read",
  handle: async ({ runs }, { run, after }) => {
    const record = runs.get(run);

    enforce(record, `no run ${run}`);

    return readRecord(record, after);
  },
};
