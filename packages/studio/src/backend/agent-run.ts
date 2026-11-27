// Runs one agent node in its folder, streams its output to every page and resolves with how it ended.
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { enforce } from "@re-cinq/floor-assembly-lines";
import { prepareWorkspace } from "../run/prepare-workspace.js";
import { blockerReasonOf } from "../run/run-preview.js";
import { runProcess } from "../run/run-process.js";
import { appendLine, endRecord, type RunEnding, type RunRecord } from "../run/run-records.js";
import { runResult } from "../run/run-result.js";
import type { StudioContext } from "./requests.js";
import type { PreviewedNode } from "./run-preview-request.js";

export interface AgentRun {
  run: string;
  ended: Promise<RunEnding>;
}

interface AgentRunTarget {
  node: string;
  folder: string;
}

export async function startAgentRun(context: StudioContext, { preview, station, line }: PreviewedNode, { node, folder }: AgentRunTarget): Promise<AgentRun> {
  enforce(preview.blockers.length === 0, blockerReasonOf(preview));
  await mkdir(folder, { recursive: true });
  await prepareWorkspace(preview);
  const run = randomUUID();
  const record: RunRecord = { lines: [] };

  context.runs.set(run, record);
  await context.writeRun(run, record);
  const running = runProcess({ command: preview.command, folder, env: { ...preview.env, ...context.runEnv } }, (outputLine) => {
    appendLine(record, outputLine);
    context.broadcast({ type: "run.output", run, line: outputLine });
  });
  record.process = running;
  const ended = running.done.then(async (processEnding) => {
    const ending = { ...processEnding, ...(await runResult({ exitCode: processEnding.exitCode, lines: record.lines, station, line, node, folder })) };

    endRecord(record, ending);
    await context.writeRun(run, record);
    context.broadcast({ type: "run.ended", run, ...ending });

    return ending;
  });

  return { run, ended };
}
