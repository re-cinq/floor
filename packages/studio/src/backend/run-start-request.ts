// The request that starts a run of one agent node and streams its output to every page.
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { enforce } from "@re-cinq/floor-assembly-lines";
import type { Request } from "../protocol.js";
import { prepareWorkspace } from "../run/prepare-workspace.js";
import { runProcess } from "../run/run-process.js";
import { appendLine, endRecord, type RunRecord } from "../run/run-records.js";
import { runResult } from "../run/run-result.js";
import type { Handler } from "./requests.js";
import { previewFor } from "./run-preview-request.js";

export type RunStartRequest = Extract<Request, { type: "run.start" }>;

export const runStartHandler: Handler<RunStartRequest> = {
  type: "run.start",
  handle: async (context, request) => {
    const { preview, station, line } = await previewFor(context, request);

    enforce(preview.blockers.length === 0, preview.blockers.join("; "));
    await mkdir(request.folder, { recursive: true });
    await prepareWorkspace(preview);
    const run = randomUUID();
    const record: RunRecord = { lines: [] };

    context.runs.set(run, record);
    await context.writeRun(run, record);
    const running = runProcess({ command: preview.command, folder: request.folder, env: context.runEnv }, (line) => {
      appendLine(record, line);
      context.broadcast({ type: "run.output", run, line });
    });
    record.process = running;
    void running.done.then(async ({ exitCode }) => {
      const ending = { exitCode, ...(await runResult({ exitCode, lines: record.lines, station, line, node: request.node, folder: request.folder })) };

      endRecord(record, ending);
      await context.writeRun(run, record);
      context.broadcast({ type: "run.ended", run, ...ending });
    });

    return { run };
  },
};
