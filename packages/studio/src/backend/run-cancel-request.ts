// The request that stops a started run; its `run.ended` frame comes from the start handler once the process is gone.
import { enforce } from "@re-cinq/floor-assembly-lines";
import type { Request } from "../protocol.js";
import type { Handler, StudioContext } from "./requests.js";

export type RunCancelRequest = Extract<Request, { type: "run.cancel" }>;

export const runCancelHandler: Handler<RunCancelRequest> = {
  type: "run.cancel",
  handle: async ({ runs }, { run }) => {
    enforce(cancelRun(runs, run), `no running run ${run}`);

    return { cancelled: run };
  },
};

export function cancelRun(runs: StudioContext["runs"], run: string): boolean {
  const running = runs.get(run)?.process;

  running?.cancel();

  return running !== undefined;
}
