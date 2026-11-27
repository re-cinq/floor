import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerFrame } from "../protocol.js";
import type { RunTranscript } from "../run/run-records.js";
import { WORKER_COLLECTION } from "./collection-view.fixtures.js";
import { readCollectionView } from "./read-collection-view.js";
import type { StudioContext } from "./requests.js";
import { previewFor, type PreviewedNode } from "./run-preview-request.js";
import { collectionOnDisk, fakeClaudeScratch } from "./studio.fixtures.js";

const NOT_USED = () => Promise.reject(new Error("not used"));

export interface AgentRunSetup {
  context: StudioContext;
  frames: ServerFrame[];
  transcripts: Map<string, RunTranscript>;
  folder: string;
}

/** The preview of flow/work with ticket ENG-1 in `folder`. */
export function previewedWorkNode({ context, folder }: Pick<AgentRunSetup, "context" | "folder">): Promise<PreviewedNode> {
  return previewFor(context, { line: "flow", node: "work", fixture: { ticket: "ENG-1" }, folder, permission: "acceptEdits" });
}

/** Runs `body` with `context` changed to a PATH holding no `claude`; the empty folder is removed after `body`. */
export async function withClaudeMissing(context: StudioContext, body: (without: StudioContext) => Promise<void>): Promise<void> {
  const emptyBin = mkdtempSync(join(tmpdir(), "floor-no-claude-"));

  try {
    await body({ ...context, runEnv: { PATH: emptyBin } });
  } finally {
    rmSync(emptyBin, { recursive: true, force: true });
  }
}

/** A StudioContext of real parts over the worker collection, whose `claude` on PATH is `script`; the scratch folders are removed after `body`. */
export async function withAgentRunSetup(script: string, body: (setup: AgentRunSetup) => Promise<void>): Promise<void> {
  const { scratch, runEnv } = fakeClaudeScratch("floor-agent-run-", script);
  const dir = collectionOnDisk(WORKER_COLLECTION);
  const { context, frames, transcripts } = contextOver(dir, runEnv);

  try {
    await body({ context, frames, transcripts, folder: join(scratch, "folder") });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface RecordingContext {
  context: StudioContext;
  frames: ServerFrame[];
  transcripts: Map<string, RunTranscript>;
  opened: string[];
}

/** A StudioContext of real parts over the collection in `dir`, keeping every frame and transcript it is given and every folder it is asked to open. */
export function contextOver(dir: string, runEnv: StudioContext["runEnv"]): RecordingContext {
  const frames: ServerFrame[] = [];
  const transcripts = new Map<string, RunTranscript>();
  const opened: string[] = [];
  const context: StudioContext = {
    readCollection: () => readCollectionView(dir, []),
    writeAgent: NOT_USED,
    writeExtra: NOT_USED,
    readFixture: NOT_USED,
    writeFixture: NOT_USED,
    readRun: async (run) => transcripts.get(run),
    writeRun: async (run, { lines, ended }) => void transcripts.set(run, { lines: [...lines], ...(ended && { ended }) }),
    runs: new Map(),
    collectionDir: dir,
    testRuns: new Map(),
    runEnv,
    broadcast: (frame) => void frames.push(frame),
    openFolder: (path) => void opened.push(path),
  };

  return { context, frames, transcripts, opened };
}
