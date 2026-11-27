// A request in, one frame out. Adding a request type is its schema in the protocol and its handler in `HANDLERS`.
import { REQUEST_TYPES, requestSchema, type Request, type RequestKind, type ResultOf, type ServerFrame } from "../protocol.js";
import { enforce } from "@re-cinq/floor-assembly-lines";
import { z } from "zod";
import type { CollectionView } from "../view.js";
import type { AgentEdit } from "./agent-file-text.js";
import { fixtureRead, fixtureWrite, type FixtureRead, type FixtureWrite } from "./fixture-requests.js";
import { runPreviewHandler, type RunPreviewRequest } from "./run-preview-request.js";
import { runCancelHandler, type RunCancelRequest } from "./run-cancel-request.js";
import { runStartHandler, type RunStartRequest } from "./run-start-request.js";
import { runReadHandler, type RunReadRequest } from "./run-read-request.js";
import { folderListHandler, testEventHandler, folderOpenHandler, testCancelHandler, testPreviewHandler, testReadHandler, testReportHandler, testStartHandler, type FolderListRequest, type TestEventRequest, type FolderOpenRequest, type TestCancelRequest, type TestPreviewRequest, type TestReadRequest, type TestReportRequest, type TestStartRequest } from "./test-run-requests.js";
import type { TestRunSession } from "./test-run-session.js";
import type { RunRecord, RunTranscript } from "../run/run-records.js";

export interface StudioContext {
  readCollection(): Promise<CollectionView>;
  /** Rewrites the agent file at a collection-relative path, refused when it changed since it was read. */
  writeAgent(file: string, edit: AgentEdit): Promise<void>;
  /** Rewrites an `.extra.md` file at a collection-relative path, refused when it changed since it was read. */
  writeExtra(file: string, edit: { text: string; version: string }): Promise<void>;
  /** The saved needs of a node's fixture; empty when none was saved. */
  readFixture(line: string, node: string): Promise<Record<string, string>>;
  writeFixture(line: string, node: string, needs: Record<string, string>): Promise<void>;
  readRun(run: string): Promise<RunTranscript | undefined>;
  writeRun(run: string, transcript: RunTranscript): Promise<void>;
  /** The record of each run started by `run.start`, by run id; kept after the run ends. */
  runs: Map<string, RunRecord>;
  /** The folder the studio serves: a test run snapshots it. */
  collectionDir: string;
  /** Each local test run started by `test.start`, by run id; kept after the run ends. */
  testRuns: Map<string, TestRunSession>;
  /** Environment laid over the studio's own for each started process. */
  runEnv?: Record<string, string>;
  /** Sends a frame to every open socket. */
  broadcast(frame: ServerFrame): void;
  /** Opens a folder in the desktop's file manager. */
  openFolder(path: string): void;
}

export interface Handler<Asked extends Request> {
  type: Asked["type"];
  handle(context: StudioContext, request: Asked): Promise<ResultOf<Asked>>;
}

function agentFileOf({ lines }: CollectionView, lineId: string, agentName: string): string | undefined {
  const nodes = lines.find(({ id }) => id === lineId)?.nodes ?? [];

  const agents = nodes.map((node) => node.agent);

  return agents.find((each) => each?.name === agentName)?.file;
}

type AgentWrite = Extract<Request, { type: "agent.write" }>;

const agentWrite: Handler<AgentWrite> = {
  type: "agent.write",
  handle: async (context, { line, agent, prompt, settings, version }) => {
    const file = agentFileOf(await context.readCollection(), line, agent);

    enforce(file, `line ${line} has no agent ${agent}`);
    await context.writeAgent(file, { prompt, settings, version });

    return { written: file };
  },
};

function extraFileOf({ lines }: CollectionView, lineId: string, agentName: string): string | undefined {
  const nodes = lines.find(({ id }) => id === lineId)?.nodes ?? [];

  const node = nodes.find((each) => each.agentDefinition === agentName && each.extra);

  return node?.extra?.file;
}

type ExtraWrite = Extract<Request, { type: "extra.write" }>;

const extraWrite: Handler<ExtraWrite> = {
  type: "extra.write",
  handle: async (context, { line, agent, text, version }) => {
    const file = extraFileOf(await context.readCollection(), line, agent);

    enforce(file, `line ${line} has no extra file for agent ${agent}`);
    await context.writeExtra(file, { text, version });

    return { written: file };
  },
};

type CollectionRead = Extract<Request, { type: "collection.read" }>;

const collectionRead: Handler<CollectionRead> = { type: "collection.read", handle: (context) => context.readCollection() };

/** One handler for each request type: a test holds the list to `REQUEST_TYPES`. */
export const HANDLERS: (Handler<CollectionRead> | Handler<AgentWrite> | Handler<ExtraWrite> | Handler<FixtureWrite> | Handler<FixtureRead> | Handler<RunPreviewRequest> | Handler<RunStartRequest> | Handler<RunCancelRequest> | Handler<RunReadRequest> | Handler<TestStartRequest> | Handler<TestReportRequest> | Handler<TestCancelRequest> | Handler<TestReadRequest> | Handler<TestPreviewRequest> | Handler<FolderOpenRequest> | Handler<FolderListRequest> | Handler<TestEventRequest>)[] = [collectionRead, agentWrite, extraWrite, fixtureWrite, fixtureRead, runPreviewHandler, runStartHandler, runCancelHandler, runReadHandler, testStartHandler, testReportHandler, testCancelHandler, testReadHandler, testPreviewHandler, folderOpenHandler, folderListHandler, testEventHandler];

export async function answerFrame(text: string, context: StudioContext): Promise<ServerFrame> {
  const held = parsedJson(text);
  const id = idOf(held);
  const parsed = requestSchema.safeParse(held);

  if (!parsed.success) return { ...(id && { id }), type: "refused", reason: refusalOf(held, parsed.error) };

  return handled(parsed.data, context);
}

async function handled(request: Request, context: StudioContext): Promise<ServerFrame> {
  const handler = new Map(HANDLERS.map((each) => [each.type, each])).get(request.type);

  if (!handler) return { id: request.id, type: "refused", reason: `no handler for ${request.type}` };

  return (handler as Handler<Request>).handle(context, request).then(
    (result): ServerFrame => ({ id: request.id, type: "result", result }),
    (cause: unknown): ServerFrame => ({ id: request.id, type: "refused", reason: cause instanceof Error ? cause.message : String(cause) }),
  );
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return NOT_JSON;
  }
}

const NOT_JSON = Symbol("not json");

function idOf(held: unknown): string | undefined {
  const id = typeof held === "object" && held !== null && "id" in held ? held.id : undefined;

  return typeof id === "string" && id !== "" ? id : undefined;
}

function refusalOf(held: unknown, error: z.ZodError): string {
  if (held === NOT_JSON) return "the frame is not JSON";
  const type = typeof held === "object" && held !== null && "type" in held ? held.type : undefined;

  return REQUEST_TYPES.includes(type as RequestKind) ? z.prettifyError(error) : `unknown request type ${JSON.stringify(type)}; known: ${REQUEST_TYPES.join(", ")}`;
}
