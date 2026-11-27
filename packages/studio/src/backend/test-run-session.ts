// A local test run in flight: its folder, its snapshot of the collection and the visits the line's walk has opened so far.
import { join } from "node:path";
import type { Report } from "@re-cinq/floor-contracts";
import { endsRun, enforce, type Transition } from "@re-cinq/floor-assembly-lines";
import { briefOf } from "../test-run/brief.js";
import { runFolderName, visitFolderName } from "../test-run/folder-names.js";
import { nextTransitionOf } from "../test-run/next-transition.js";
import { enforceStartable } from "../test-run/start-blockers.js";
import { startItemsOf } from "../test-run/start-items.js";
import { standInReport, type StandInAnswer, type SuppliedFile } from "../test-run/stand-in-report.js";
import { nodeAt, stationAt } from "../test-run/test-line.js";
import { modeOf } from "../test-run/timeline.js";
import type { TestRun, VisitState } from "../test-run/test-visit.js";
import { visitRecordOf } from "../test-run/visit-record.js";
import { visitKindOf } from "../test-run/visit-kind.js";
import type { CollectionView } from "../view.js";
import { readCollectionView } from "./read-collection-view.js";
import { readTestLine } from "./read-test-line.js";
import type { StudioContext } from "./requests.js";
import { cancelRun } from "./run-cancel-request.js";
import { runAgentVisit } from "./test-run-agent-visit.js";
import { createRunFolder } from "./test-run-folder.js";
import { SNAPSHOT_FOLDER, snapshotCollection } from "./test-run-snapshot.js";
import { enforcePickedFilesOnDisk, suppliedTargets, writeSuppliedFiles } from "./test-run-supplied-files.js";
import { appendTimeline } from "./test-run-timeline.js";
import { outputsFolderOf, writeVisitInputs, writeVisitRecord } from "./test-run-visit-files.js";

export interface TestRunStart {
  collectionDir: string;
  lineId: string;
  workspace: string;
  entered: Readonly<Record<string, string>>;
  permission: "acceptEdits" | "bypass";
}

export type { VisitState };

export interface TestRunState {
  folder: string;
  lineId: string;
  status: "running" | "waiting" | "settled";
  ending?: TestRunEnding;
  visits: VisitState[];
}

export interface TestRunEnding {
  outcome: "finished" | "iteration_max" | "error" | "failed" | "cancelled";
  reason?: string;
}

export interface TestRunSession {
  state(): TestRunState;
  idle(): Promise<void>;
  cancel(): Promise<void>;
  report(visitId: string, answer: StandInAnswer): Promise<void>;
}

interface RunWork {
  context: StudioContext;
  start: TestRunStart;
  view: CollectionView;
  run: TestRun;
  state: TestRunState;
  clock: () => Date;
  cancelled: boolean;
  agentRun?: string;
}

export async function startTestRun(context: StudioContext, start: TestRunStart, clock: () => Date = () => new Date()): Promise<TestRunSession> {
  const { collectionDir, lineId, workspace, entered } = start;
  const liveLine = await readTestLine(collectionDir, lineId);
  const { items: startItems, missing } = startItemsOf(liveLine, entered);

  enforceStartable(lineId, liveLine, missing);

  const startedAt = clock();
  const folder = await createRunFolder(workspace, runFolderName(lineId, startedAt));

  await snapshotCollection(collectionDir, folder);
  const snapshot = join(folder, SNAPSHOT_FOLDER);
  const [line, view] = await Promise.all([readTestLine(snapshot, lineId), readCollectionView(snapshot, [])]);
  const state: TestRunState = { folder, lineId, status: "running", visits: [] };
  const run: TestRun = { line, startItems, visits: state.visits };
  const work: RunWork = { context, start, view, run, state, clock, cancelled: false };

  await appendTimeline(folder, { "at": startedAt.toISOString(), type: "run_started", line: lineId });

  let stepping = stepRun(work);

  return {
    state: () => state,
    idle: () => stepping,
    cancel: () => {
      work.cancelled = true;
      if (work.agentRun !== undefined) cancelRun(context.runs, work.agentRun);

      return stepping;
    },
    report: async (visitId, answer) => {
      const accepted = acceptReport(work, visitId, answer);

      stepping = reportThenStep(work, accepted, answer.files ?? {});

      return stepping;
    },
  };
}

interface AcceptedReport {
  visit: VisitState;
  targets: Record<string, string>;
}

function acceptReport({ run, state }: RunWork, visitId: string, answer: StandInAnswer): AcceptedReport {
  const visit = state.visits.find(({ id }) => id === visitId);

  enforce(visit, `the run has no visit ${visitId}`);
  enforce(visit.kind === "stand-in", `visit ${visitId} was run by an agent, and a person cannot answer for it`);
  enforce(visit.report === null, `visit ${visitId} has already reported ${visit.report?.outcome}`);
  enforcePickedFilesOnDisk(answer.files ?? {});

  const report = standInReport(run.line, visit.nodeId, answer);
  const outputsFolder = outputsFolderOf(state.folder, visitId);
  const targets = suppliedTargets(stationAt(run.line, visit.nodeId).station, answer.files ?? {}, outputsFolder);
  const produced = { ...report.produced, ...targets };

  visit.report = Object.keys(produced).length === 0 ? report : { ...report, produced };
  state.status = "running";

  return { visit, targets };
}

async function reportThenStep(work: RunWork, { visit, targets }: AcceptedReport, files: Readonly<Record<string, SuppliedFile>>): Promise<void> {
  await writeSuppliedFiles(targets, files);
  await noteReported(work, visit);

  return stepRun(work);
}

async function stepRun(work: RunWork): Promise<void> {
  if (work.cancelled) return settleRun(work, { outcome: "cancelled" });

  const transition = nextTransitionOf(work.run);

  if (endsRun(transition)) return settleRun(work, endingOf(transition));

  if (transition.kind !== "launch") return;

  const visit = openVisit(work, transition);
  const { state } = work;

  state.visits.push(visit);
  await noteOpened(work, visit);

  if (visit.kind !== "agent") {
    state.status = "waiting";

    return;
  }

  await runAgentStep(work, visit);

  return stepRun(work);
}

async function runAgentStep(work: RunWork, visit: VisitState): Promise<void> {
  const { context, view, start, state } = work;

  const onRun = (run: string): void => {
    work.agentRun = run;
  };

  await runAgentVisit({ context, view, folder: state.folder, lineId: state.lineId, permission: start.permission, onRun }, visit);
  await noteReported(work, visit);
}

async function settleRun(work: RunWork, ending: TestRunEnding): Promise<void> {
  const { state } = work;

  state.status = "settled";
  state.ending = ending;
  await appendTimeline(state.folder, { "at": work.clock().toISOString(), type: "run_settled", outcome: ending.outcome });
}

function endingOf(transition: Extract<Transition, { kind: "finish" | "halt" }>): TestRunEnding {
  if (transition.kind === "finish") return { outcome: "finished" };

  return { outcome: transition.outcome, reason: transition.reason };
}

function noteOpened(work: RunWork, { id, nodeId, iteration, kind, needs, openedAt }: VisitState): Promise<void> {
  return Promise.all([
    appendTimeline(work.state.folder, { "at": openedAt, type: "visit_opened", visit: id, node: nodeId, iteration, mode: modeOf(kind) }),
    writeVisitInputs(work.state.folder, id, needs),
  ]).then(() => undefined);
}

function openVisit({ run, state, clock }: RunWork, { nodeId, iteration }: Extract<Transition, { kind: "launch" }>): VisitState {
  const { line } = run;

  return {
    id: visitFolderName(state.visits.length + 1, nodeId, iteration),
    nodeId,
    iteration,
    station: nodeAt(line, nodeId).station ?? null,
    kind: visitKindOf(line, nodeId),
    needs: briefOf(run, nodeId).needs,
    report: null,
    openedAt: clock().toISOString(),
  };
}

async function noteReported(work: RunWork, visit: VisitState): Promise<void> {
  const { state, run } = work;
  const report = visit.report as Report;
  const reportedAt = work.clock().toISOString();

  visit.reportedAt = reportedAt;
  await Promise.all([
    appendTimeline(state.folder, { "at": reportedAt, type: "visit_reported", visit: visit.id, outcome: report.outcome }),
    writeVisitRecord(state.folder, visitRecordOf(run.line, visit, report)),
  ]);
}
