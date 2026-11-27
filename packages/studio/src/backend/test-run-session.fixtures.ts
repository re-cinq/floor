import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { vi } from "vitest";
import { join } from "node:path";
import type { CollectionFile } from "@re-cinq/floor-pipeline";
import type { ServerFrame } from "../protocol.js";
import type { StandInAnswer } from "../test-run/stand-in-report.js";
import { contextOver } from "./agent-run.fixtures.js";
import type { StudioContext } from "./requests.js";
import { startTestRun, type TestRunSession } from "./test-run-session.js";
import { collectionOnDisk, fakeClaudeScratch } from "./studio.fixtures.js";
import { REVIEW_LOOP_COLLECTION } from "./test-run.fixtures.js";

const RESULT_LINE = { type: "result", result: "Done.\nLORE_NODE_RESULT: success", total_cost_usd: 0.0421, duration_ms: 8400 };

/** A fake claude that leaves 'A draft about tides.' in draft.md and states success, 0.0421 dollars and 8400 ms. */
export const WRITES_DRAFT = `#!/bin/sh\nprintf 'A draft about tides.\\n' > draft.md\nprintf '%s\\n' '${JSON.stringify(RESULT_LINE)}'\n`;
/** A fake claude that leaves 'A draft about tides.' in draft.md, makes its visit folder read-only and states success. */
export const LOCKS_ITS_VISIT_FOLDER = `#!/bin/sh\nprintf 'A draft about tides.\\n' > draft.md\nchmod a-w ..\nprintf '%s\\n' '${JSON.stringify(RESULT_LINE)}'\n`;
/** A fake claude that writes secret.txt in the run folder, links draft.md to it and states success. */
export const LINKS_ITS_DRAFT = `#!/bin/sh\nprintf 'secret\\n' > ../../../secret.txt\nln -s ../../../secret.txt draft.md\nprintf '%s\\n' '${JSON.stringify(RESULT_LINE)}'\n`;
/** A fake claude that leaves its own arguments,the prompt among them, in draft.md and states success. */
export const WRITES_ITS_PROMPT = `#!/bin/sh\nprintf '%s' "$*" > draft.md\nprintf '%s\\n' '${JSON.stringify(RESULT_LINE)}'\n`;
/** A fake claude that says one line, then sleeps 5 s before it would write survived.txt. */
export const SLEEPS_THEN_WRITES = `#!/bin/sh\nprintf '%s\\n' '{"type":"system","subtype":"init"}'\nsleep 5\nprintf 'still here\\n' > survived.txt\n`;
export const EXITS_WITH_3 = "#!/bin/sh\nexit 3\n";
/** The run folder's name for a review-loop run started at STARTED_AT. */
export const RUN_FOLDER = "review-loop-20261127-141230";
export const STARTED_AT = Date.parse("2026-11-27T14:12:30.000Z");
const ANSWER_DELAY_MS = 90_000;

export interface TestRunSetup {
  context: StudioContext;
  collectionDir: string;
  workspace: string;
  frames: ServerFrame[];
  opened: string[];
}

/** A StudioContext of real parts whose `claude` on PATH is `script`, the review-loop collection on disk and an empty workspace; all removed after `body`. */
export async function withTestRunSetup(script: string, body: (setup: TestRunSetup) => Promise<void>, files: readonly CollectionFile[] = REVIEW_LOOP_COLLECTION): Promise<void> {
  const { scratch, runEnv } = fakeClaudeScratch("floor-test-run-", script);
  const collectionDir = collectionOnDisk(files);
  const workspace = join(scratch, "workspace");
  const { context, frames, opened } = contextOver(collectionDir, runEnv);

  mkdirSync(workspace);

  try {
    await body({ context, collectionDir, workspace, frames, opened });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(collectionDir, { recursive: true, force: true });
  }
}

/** Resolves once the agent has said its first line, as the studio broadcast it. */
export function untilAgentSpeaks({ frames }: TestRunSetup): Promise<void> {
  return vi.waitFor(() => {
    if (!frames.some(({ type }) => type === "run.output")) throw new Error("the agent has not spoken yet");
  });
}

export function startReviewLoopOnTides({ context, collectionDir, workspace }: TestRunSetup, clock: () => Date = () => new Date(STARTED_AT)): Promise<TestRunSession> {
  return startTestRun(context, { collectionDir, lineId: "review-loop", workspace, entered: { topic: "tides" }, permission: "acceptEdits" }, clock);
}

/** Review-loop on tides, approved at 002-review-1 with the clock standing still. */
export async function settleReviewLoopApproved(setup: TestRunSetup): Promise<TestRunSession> {
  const session = await startReviewLoopOnTides(setup);

  await session.idle();
  await session.report("002-review-1", { outcome: "approved", produced: {} });

  return session;
}

/** Review-loop on tides started at STARTED_AT and approved at 002-review-1 ninety seconds later. */
export async function approveAfter90Seconds(setup: TestRunSetup): Promise<TestRunSession> {
  let now = STARTED_AT;
  const session = await startReviewLoopOnTides(setup, () => new Date(now));

  await session.idle();
  now += ANSWER_DELAY_MS;
  await session.report("002-review-1", { outcome: "approved", produced: {} });

  return session;
}

/** What a report came to: the refusal's message or "reported", and the run as it stands afterwards. */
export async function refusalOf(session: TestRunSession, visitId: string, answer: StandInAnswer) {
  const refusal = await session.report(visitId, answer).then(
    () => "reported",
    (thrown: Error) => thrown.message,
  );
  const { status, visits } = session.state();

  return { refusal, status, visits: visits.map(({ id, report }) => [id, report?.outcome ?? null]) };
}

export function endOf(session: TestRunSession) {
  const { status, ending, visits } = session.state();

  return { status, ending, visits: visits.map(({ id, report }) => [id, report]) };
}

/** "idle" once the session idles, or the message it rejected with. */
export function idleOrMessage(session: TestRunSession): Promise<string> {
  return session.idle().then(
    () => "idle",
    (error: Error) => error.message,
  );
}

/** The parsed lines of a JSON-lines file. */
export function jsonLinesIn(path: string): unknown[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as unknown);
}
