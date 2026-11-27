// The request that starts a run of one agent node and streams its output to every page.
import type { Request } from "../protocol.js";
import { startAgentRun } from "./agent-run.js";
import type { Handler } from "./requests.js";
import { previewFor } from "./run-preview-request.js";

export type RunStartRequest = Extract<Request, { type: "run.start" }>;

export const runStartHandler: Handler<RunStartRequest> = {
  type: "run.start",
  handle: async (context, request) => {
    const { run } = await startAgentRun(context, await previewFor(context, request), request);

    return { run };
  },
};
