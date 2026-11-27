// A local test run in flight: its folder, its snapshot of the collection and the visits the line's walk has opened so far.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Report } from "@re-cinq/floor-contracts";
import { endsRun, enforce, type Transition } from "@re-cinq/floor-assembly-lines";
import { answeredVisitsOf, type SentEvent } from "../test-run/event-answer.js";
import { briefOf } from "../test-run/brief.js";
import { runFolderName, visitFolderName } from "../test-run/folder-names.js";
import { nextTransitionOf } from "../test-run/next-transition.js";
import { enforceStartable } from "../test-run/start-blockers.js";
import { runSummaryOf } from "../test-run/run-summary.js";
import { startItemsOf } from "../test-run/start-items.js";
import { standInReport, type StandInAnswer } from "../test-run/stand-in-report.js";
import { nodeAt, stationAt } from "../test-run/test-line.js";
import { modeOf, type TimelineEntry } from "../test-run/timeline.js";
import type { TestRunEnding, TestRunState } from "../test-run/test-run-state.js";
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
import { appendTimeline, writeRunSummary } from "./test-run-timeline.js";
import { outputsFolderOf, writeVisitInputs, writeVisitRecord } from "./test-run-visit-files.js";

export interface TestRunStart {
  collectionDir: string;
  lineId: string;
  workspace: string;
  entered: Readonly<Record<string, string>>;
  permission: "acceptEdits" | "bypass";
}

export interface TestRunSession {
  id: string;
  state(): TestRunState;
  idle(): Promise<void>;
  cancel(): Promise<void>;
  report(visitId: string, answer: StandInAnswer): Promise<void>;
  event(sent: SentEvent): Promise<{ answered: string[] }>;
}

interface RunWork {
  id: string;
  context: StudioContext;
  start: TestRunStart;
  view: CollectionView;
  run: TestRun;
  state: TestRunState;
  clock: () => Date;
  startedAt: string;
  cancelled: boolean;
  stepping: Promise<void>;
  agentRun?: string;
}

export async function startTestRun(context: StudioContext, start: TestRunStart, clock: () => Date = () => new Date()): Promise<TestRunSession> {
  const { collectionDir, lineId, workspace, entered } = start;
  const liveLine = await readTestLine(collectionDir, lineId);
  const { items: startItems, missing } = startItemsOf(liveLine, entered);

  enforceStartable(lineId, liveLine, missing);

  const startedAt = clock();
  const folder = await createRunFolder(workspace, runFolderName(lineId, startedAt));
  const snapshotDir = join(folder, SNAPSHOT_FOLDER);

  await snapshotCollection(collectionDir, folder);
  const [line, view] = await Promise.all([readTestLine(snapshotDir, lineId), readCollectionView(snapshotDir, [])]);
  const state: TestRunState = { folder, lineId, status: "running", visits: [] };
  const run: TestRun = { line, startItems, visits: state.visits };
  const work: RunWork = { id: randomUUID(), context, start, view, run, state, clock, startedAt: startedAt.toISOString(), cancelled: false, stepping: Promise.resolve() };

  await noteInTimeline(work, { "at": startedAt.toISOString(), type: "run_started", line: lineId });
  void trackStep(work, stepRun(work));

  return sessionOf(work);
}

function sessionOf(work: RunWork): TestRunSession {
  return {
    id: work.id,
    state: () => work.state,
    idle: () => work.stepping,
    cancel: () => cancelWork(work),
    report: (visitId, answer) => reportAnswer(work, visitId, answer),
    event: (sent) => answerEvent(work, sent),
  };
}

function cancelWork(work: RunWork): Promise<void> {
  const { status } = work.state;

  if (status === "settled") return work.stepping;

  work.cancelled = true;
  if (status === "waiting") return trackStep(work, settleRun(work, { outcome: "cancelled" }));
  if (work.agentRun !== undefined) cancelRun(work.context.runs, work.agentRun);

  return work.stepping;
}

async function reportAnswer(work: RunWork, visitId: string, answer: StandInAnswer): Promise<void> {
  const accepted = acceptReport(work, visitId, answer);
  const written = writeSuppliedFiles(accepted.targets, answer.files ?? {}).catch((cause: unknown) => refuseReport(work, accepted, cause));
  const stepped = written.then(() => trackStep(work, noteThenStep(work, [accepted])));

  work.stepping = stepped.catch(() => undefined);

  return stepped;
}

function refuseReport({ state }: RunWork, { visit }: AcceptedReport, cause: unknown): never {
  visit.report = null;
  state.status = "waiting";

  throw cause;
}

async function answerEvent(work: RunWork, sent: SentEvent): Promise<{ answered: string[] }> {
  const { answered, settled } = receiveEvent(work, sent);

  await (answered.length > 0 ? trackStep(work, settled) : settled);

  return { answered };
}

function receiveEvent(work: RunWork, sent: SentEvent): { answered: string[]; settled: Promise<void> } {
  const { state, run } = work;

  enforceTakesAnswers(state);

  const answers = answeredVisitsOf(run.line, state.visits, sent);
  const answered = answers.map(({ visit }) => visit.id);
  const reported = answers.map(({ visit, outcome }): ReportedVisit => ({ visit, report: { outcome } }));

  for (const { visit, report } of reported) visit.report = report;
  if (answers.length > 0) state.status = "running";

  const received = noteInTimeline(work, { "at": work.clock().toISOString(), type: "event_received", event: sent.name, payload: sent.payload, answered });

  if (answers.length === 0) return { answered, settled: received };

  return { answered, settled: received.then(() => noteThenStep(work, reported)) };
}

function enforceTakesAnswers(state: RunWork["state"]): void {
  enforce(state.status !== "settled", "the run is settled, and a settled run takes no answers");
}

interface ReportedVisit {
  visit: VisitState;
  report: Report;
}

interface AcceptedReport extends ReportedVisit {
  targets: Record<string, string>;
}

function acceptReport({ run, state }: RunWork, visitId: string, answer: StandInAnswer): AcceptedReport {
  const visit = state.visits.find(({ id }) => id === visitId);

  enforce(visit, `the run has no visit ${visitId}`);
  enforce(visit.kind === "stand-in", `visit ${visitId} was run by an agent, and a person cannot answer for it`);
  enforce(visit.report === null, `visit ${visitId} has already reported ${visit.report?.outcome}`);
  enforceTakesAnswers(state);
  enforcePickedFilesOnDisk(answer.files ?? {});

  const report = standInReport(run.line, visit.nodeId, answer);
  const outputsFolder = outputsFolderOf(state.folder, visitId);
  const targets = suppliedTargets(stationAt(run.line, visit.nodeId).station, answer.files ?? {}, outputsFolder);
  const produced = { ...report.produced, ...targets };

  const accepted = Object.keys(produced).length === 0 ? report : { ...report, produced };

  visit.report = accepted;
  state.status = "running";

  return { visit, report: accepted, targets };
}

function trackStep(work: RunWork, step: Promise<void>): Promise<void> {
  work.stepping = step.catch((cause: unknown) => settleFailedRun(work, cause));

  return work.stepping;
}

async function settleFailedRun(work: RunWork, cause: unknown): Promise<void> {
  const reason = cause instanceof Error ? cause.message : String(cause);

  try {
    await settleRun(work, { outcome: "error", reason });
  } catch {
    work.context.broadcast({ type: "test.changed", run: work.id, state: work.state });
  }
}

async function noteThenStep(work: RunWork, reported: ReportedVisit[]): Promise<void> {
  for (const { visit, report } of reported) await noteReported(work, visit, report);

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
  if (visit.kind !== "agent") state.status = "waiting";
  await noteOpened(work, visit);

  if (visit.kind !== "agent") return;

  await runAgentStep(work, visit);

  return stepRun(work);
}

async function runAgentStep(work: RunWork, visit: VisitState): Promise<void> {
  const { context, view, start, state } = work;

  const onRun = (run: string): void => {
    work.agentRun = run;
  };

  const report = await runAgentVisit({ context, view, folder: state.folder, lineId: state.lineId, permission: start.permission, onRun }, visit);

  await noteReported(work, visit, report);
}

async function settleRun(work: RunWork, ending: TestRunEnding): Promise<void> {
  const { state } = work;

  state.status = "settled";
  state.ending = ending;
  await noteInTimeline(work, { "at": work.clock().toISOString(), type: "run_settled", outcome: ending.outcome });
}

function endingOf(transition: Extract<Transition, { kind: "finish" | "halt" }>): TestRunEnding {
  if (transition.kind === "finish") return { outcome: "finished" };

  return { outcome: transition.outcome, reason: transition.reason };
}

async function noteInTimeline(work: RunWork, entry: TimelineEntry): Promise<void> {
  const { state, run, startedAt } = work;

  await appendTimeline(state.folder, entry);
  await writeRunSummary(state.folder, runSummaryOf(startedAt, run.startItems, state));
  work.context.broadcast({ type: "test.changed", run: work.id, state: work.state });
}

function noteOpened(work: RunWork, { id, nodeId, iteration, kind, needs, openedAt }: VisitState): Promise<void> {
  return Promise.all([
    noteInTimeline(work, { "at": openedAt, type: "visit_opened", visit: id, node: nodeId, iteration, mode: modeOf(kind) }),
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

async function noteReported(work: RunWork, visit: VisitState, report: Report): Promise<void> {
  const { state, run } = work;
  const reportedAt = work.clock().toISOString();

  visit.reportedAt = reportedAt;
  await Promise.all([
    noteInTimeline(work, { "at": reportedAt, type: "visit_reported", visit: visit.id, outcome: report.outcome }),
    writeVisitRecord(state.folder, visitRecordOf(run.line, visit, report)),
  ]);
}
