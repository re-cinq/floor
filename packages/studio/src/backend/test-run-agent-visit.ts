// An agent's visit in a local test run: previews the prompt, runs the agent in the visit folder and keeps what it wrote and said.
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { StationBody } from "@re-cinq/floor-contracts";
import { agentReportOf } from "../test-run/agent-report.js";
import type { VisitState } from "../test-run/test-visit.js";
import type { RunEnding } from "../run/run-records.js";
import type { CollectionView } from "../view.js";
import { startAgentRun } from "./agent-run.js";
import type { StudioContext } from "./requests.js";
import { previewOf } from "./run-preview-request.js";
import { outputsFolderOf, visitFolderOf, writeVisitPrompt, writeVisitTranscript } from "./test-run-visit-files.js";

export interface AgentVisitSetup {
  context: StudioContext;
  view: CollectionView;
  folder: string;
  lineId: string;
  permission: "acceptEdits" | "bypass";
  onRun: (run: string) => void;
}

export async function runAgentVisit({ context, view, folder, lineId, permission, onRun }: AgentVisitSetup, visit: VisitState): Promise<void> {
  const visitFolder = visitFolderOf(folder, visit.id);
  const workFolder = join(visitFolder, "work");
  const { nodeId, needs } = visit;
  const previewed = await previewOf(view, { line: lineId, node: nodeId, fixture: needs, folder: workFolder, permission });

  await writeVisitPrompt(folder, visit.id, previewed.preview.prompt);
  const { run, ended } = await startAgentRun(context, previewed, { node: nodeId, folder: workFolder });
  onRun(run);
  const ending = await ended;

  const { runs } = context;

  await writeVisitTranscript(folder, visit.id, runs.get(run)?.lines ?? []);
  const saved = await saveOutputs(previewed.station, ending, { workFolder, outputsFolder: outputsFolderOf(folder, visit.id) });

  visit.report = agentReportOf(ending, saved);
  if (ending.costUsd !== undefined) visit.costUsd = ending.costUsd;
  if (ending.durationMs !== undefined) visit.agentDurationMs = ending.durationMs;
}

interface OutputFolders {
  workFolder: string;
  outputsFolder: string;
}

async function saveOutputs(station: StationBody, { produced = [] }: RunEnding, { workFolder, outputsFolder }: OutputFolders): Promise<Record<string, string>> {
  const foundNames = new Set(produced.filter(({ found }) => found).map(({ name }) => name));
  const saving = station.produces.filter(({ name, path }) => foundNames.has(name) && path !== undefined);
  const saved = await Promise.all(
    saving.map(async ({ name, path }): Promise<[string, string]> => {
      const target = join(outputsFolder, path as string);

      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(workFolder, path as string), target);

      return [name, target];
    }),
  );

  return Object.fromEntries(saved);
}
