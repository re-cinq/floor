// An agent's visit in a local test run: previews the prompt, runs the agent in the visit folder and keeps what it wrote and said.
import { copyFile, lstat, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ProduceSpec, Report, StationBody } from "@re-cinq/floor-contracts";
import { agentReportOf } from "../test-run/agent-report.js";
import type { VisitState } from "../test-run/test-visit.js";
import { blockerReasonOf } from "../run/run-preview.js";
import type { RunEnding } from "../run/run-records.js";
import type { CollectionView } from "../view.js";
import { startAgentRun } from "./agent-run.js";
import type { StudioContext } from "./requests.js";
import { previewOf, type PreviewedNode } from "./run-preview-request.js";
import { outputsFolderOf, visitFolderOf, writeVisitPrompt, writeVisitTranscript } from "./test-run-visit-files.js";

export interface AgentVisitSetup {
  context: StudioContext;
  view: CollectionView;
  folder: string;
  lineId: string;
  permission: "acceptEdits" | "bypass";
  onRun: (run: string) => void;
}

export async function runAgentVisit(setup: AgentVisitSetup, visit: VisitState): Promise<Report> {
  const { view, folder, lineId, permission } = setup;
  const workFolder = join(visitFolderOf(folder, visit.id), "work");
  const previewed = await previewOf(view, { line: lineId, node: visit.nodeId, fixture: visit.needs, folder: workFolder, permission });
  const { preview } = previewed;

  await writeVisitPrompt(folder, visit.id, preview.prompt);

  if (preview.blockers.length > 0) {
    visit.report = { outcome: "failed", error: blockerReasonOf(preview) };

    return visit.report;
  }

  return runStartedAgent(setup, visit, previewed, workFolder);
}

async function runStartedAgent({ context, folder, onRun }: AgentVisitSetup, visit: VisitState, previewed: PreviewedNode, workFolder: string): Promise<Report> {
  const { run, ended } = await startAgentRun(context, previewed, { node: visit.nodeId, folder: workFolder });

  onRun(run);

  const ending = await ended;
  const { runs } = context;

  await writeVisitTranscript(folder, visit.id, runs.get(run)?.lines ?? []);
  const report = await reportOfOutputs(previewed.station, ending, { workFolder, outputsFolder: outputsFolderOf(folder, visit.id) });

  keepOnVisit(visit, report, ending);

  return report;
}

function keepOnVisit(visit: VisitState, report: Report, { costUsd, durationMs }: RunEnding): void {
  visit.report = report;
  if (costUsd !== undefined) visit.costUsd = costUsd;
  if (durationMs !== undefined) visit.agentDurationMs = durationMs;
}

interface OutputFolders {
  workFolder: string;
  outputsFolder: string;
}

type DeclaredOutput = ProduceSpec & { path: string };

async function reportOfOutputs(station: StationBody, ending: RunEnding, folders: OutputFolders): Promise<Report> {
  const outputs = foundOutputsOf(station, ending);
  const reasons = await linkReasonsOf(outputs, folders.workFolder);

  if (reasons.length > 0) return { outcome: "failed", error: reasons.join("; ") };

  return agentReportOf(ending, await saveOutputs(outputs, folders));
}

function foundOutputsOf(station: StationBody, { produced = [] }: RunEnding): DeclaredOutput[] {
  const foundNames = new Set(produced.filter(({ found }) => found).map(({ name }) => name));

  return station.produces.filter((output): output is DeclaredOutput => foundNames.has(output.name) && output.path !== undefined);
}

async function linkReasonsOf(outputs: DeclaredOutput[], workFolder: string): Promise<string[]> {
  const stats = await Promise.all(outputs.map(async (output) => ({ output, stat: await lstat(join(workFolder, output.path)) })));

  return stats.filter(({ stat }) => stat.isSymbolicLink()).map(({ output }) => output).map(({ name, path }) => `${name}: ${path} is a link, and an output must be a file the agent wrote`);
}

async function saveOutputs(outputs: DeclaredOutput[], { workFolder, outputsFolder }: OutputFolders): Promise<Record<string, string>> {
  const saved = await Promise.all(
    outputs.map(async ({ name, path }): Promise<[string, string]> => {
      const target = join(outputsFolder, path);

      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(workFolder, path), target);

      return [name, target];
    }),
  );

  return Object.fromEntries(saved);
}
