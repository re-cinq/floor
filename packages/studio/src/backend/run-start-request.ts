// The request that starts a run of one agent node and streams its output to every page.
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { enforce } from "@re-cinq/floor-assembly-lines";
import type { Request } from "../protocol.js";
import { prepareWorkspace } from "../run/prepare-workspace.js";
import { runProcess } from "../run/run-process.js";
import { appendLine, endRecord, type RunRecord } from "../run/run-records.js";
import type { Handler } from "./requests.js";
import { previewFor } from "./run-preview-request.js";

export type RunStartRequest = Extract<Request, { type: "run.start" }>;

export const runStartHandler: Handler<RunStartRequest> = {
  type: "run.start",
  handle: async (context, request) => {
    const preview = await previewFor(context, request);

    enforce(preview.blockers.length === 0, preview.blockers.join("; "));
    await mkdir(request.folder, { recursive: true });
    await prepareWorkspace(preview);
    const run = randomUUID();
    const record: RunRecord = { lines: [] };

    context.runs.set(run, record);
    const running = runProcess({ command: preview.command, folder: request.folder, env: context.runEnv }, (line) => {
      appendLine(record, line);
      context.broadcast({ type: "run.output", run, line });
    });
    record.process = running;
    void running.done.then(({ exitCode }) => {
      endRecord(record, exitCode);
      context.broadcast({ type: "run.ended", run, exitCode });
    });

    return { run };
  },
};
