// The requests that start, answer for, cancel and read a local test run of a whole line; its `test.changed` frames come from the session.
import { readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { enforce } from "@re-cinq/floor-assembly-lines";
import type { FolderListing } from "../folder-listing.js";
import type { Request } from "../protocol.js";
import type { Handler, StudioContext } from "./requests.js";
import { testPreviewOf } from "../test-run/test-preview.js";
import { rememberLastTest } from "./last-tests.js";
import { enforceAbsolute, isFolder } from "./test-run-folder.js";
import { readTestLine } from "./read-test-line.js";
import { snapshotPathsIn } from "./test-run-snapshot.js";
import { startTestRun, type TestRunSession } from "./test-run-session.js";

export type TestStartRequest = Extract<Request, { type: "test.start" }>;
export type TestReportRequest = Extract<Request, { type: "test.report" }>;
export type TestCancelRequest = Extract<Request, { type: "test.cancel" }>;
export type TestReadRequest = Extract<Request, { type: "test.read" }>;

export type TestPreviewRequest = Extract<Request, { type: "test.preview" }>;
export type FolderOpenRequest = Extract<Request, { type: "folder.open" }>;
export type FolderListRequest = Extract<Request, { type: "folder.list" }>;
export type TestEventRequest = Extract<Request, { type: "test.event" }>;

export const testStartHandler: Handler<TestStartRequest> = {
  type: "test.start",
  handle: async (context, { line, workspace, entered, permission }) => {
    const session = await startTestRun(context, { collectionDir: context.collectionDir, lineId: line, workspace, entered, permission });

    context.testRuns.set(session.id, session);
    // Remembering is a convenience, the run has started.
    await rememberLastTest(context.collectionDir, line, { workspace, entered }).catch(() => undefined);

    return { run: session.id, folder: session.state().folder };
  },
};

export const testReportHandler: Handler<TestReportRequest> = {
  type: "test.report",
  handle: async (context, { run, visit, outcome, produced, files }) => {
    await sessionOf(context, run).report(visit, { outcome, produced, ...(files && { files }) });

    return { reported: visit };
  },
};

export const testCancelHandler: Handler<TestCancelRequest> = {
  type: "test.cancel",
  handle: async (context, { run }) => {
    await sessionOf(context, run).cancel();

    return { cancelled: run };
  },
};

export const testPreviewHandler: Handler<TestPreviewRequest> = {
  type: "test.preview",
  handle: async (context, { line, entered }) => {
    const [testLine, definitions] = await Promise.all([readTestLine(context.collectionDir, line), snapshotPathsIn(context.collectionDir)]);

    return testPreviewOf(testLine, entered, definitions);
  },
};

export const testReadHandler: Handler<TestReadRequest> = {
  type: "test.read",
  handle: async (context, { run }) => sessionOf(context, run).state(),
};

export const testEventHandler: Handler<TestEventRequest> = {
  type: "test.event",
  handle: async (context, { run, event, payload }) => sessionOf(context, run).event({ name: event, payload }),
};

function sessionOf(context: StudioContext, run: string): TestRunSession {
  const session = context.testRuns.get(run);

  enforce(session, `there is no test run ${run}`);

  return session;
}

export const folderOpenHandler: Handler<FolderOpenRequest> = {
  type: "folder.open",
  handle: async (context, { path }) => {
    const runFolder = runFolderOf(context, path);

    enforce(runFolder, `${path} is not inside a test run's folder`);
    await enforceRealFolderInside(runFolder, path);
    context.openFolder(path);

    return { opened: path };
  },
};

function runFolderOf({ testRuns }: StudioContext, path: string): string | undefined {
  return [...testRuns.values()].map((session) => session.state().folder).find((folder) => isInside(folder, path));
}

async function enforceRealFolderInside(runFolder: string, path: string): Promise<void> {
  const realPath = await realpath(path).catch(() => undefined);

  enforce(realPath, `${path} is not a folder`);
  enforce(isInside(await realpath(runFolder), realPath), `${path} is not inside a test run's folder`);
  enforce(await isFolder(realPath), `${path} is not a folder`);
}

function isInside(folder: string, path: string): boolean {
  const inside = relative(folder, resolve(path));

  return inside !== ".." && !inside.startsWith(`..${sep}`) && !isAbsolute(inside);
}

export const folderListHandler: Handler<FolderListRequest> = {
  type: "folder.list",
  handle: async (context, { path = homedir() }) => {
    enforceAbsolute(path, "the folder to list");
    enforce(await isFolder(path), `${path} is not a folder on disk`);

    return listFolder(path);
  },
};

async function listFolder(path: string): Promise<FolderListing> {
  const entries = await readdir(path, { withFileTypes: true });
  const parent = dirname(path);

  return {
    path,
    parent: parent === path ? null : parent,
    folders: namesOf(entries.filter((entry) => entry.isDirectory())),
    files: namesOf(entries.filter((entry) => !entry.isDirectory())),
  };
}

function namesOf(entries: { name: string }[]): string[] {
  return entries.map(({ name }) => name).sort();
}
