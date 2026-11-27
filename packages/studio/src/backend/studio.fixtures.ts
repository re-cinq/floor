import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import WebSocket from "ws";
import { z } from "zod";
import type { CollectionFile } from "@re-cinq/floor-pipeline";
import { serverFrameSchema, type ServerFrame } from "../protocol.js";
import { WORKER_COLLECTION } from "./collection-view.fixtures.js";
import { startStudio, type Studio, type StudioOptions } from "./start-studio.js";

const WAIT_MS = 5000;

export function collectionOnDisk(files: readonly CollectionFile[]): string {
  const root = mkdtempSync(join(tmpdir(), "floor-studio-"));

  for (const { path, text } of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }

  return root;
}

export interface Client {
  socket: WebSocket;
  send(frame: unknown): void;
  /** The next frame the backend sends, or a rejection when none comes in time. */
  next(): Promise<ServerFrame>;
  /** The next frame of this type, the ones before it passed over. */
  nextOfType<Type extends ServerFrame["type"]>(type: Type): Promise<Extract<ServerFrame, { type: Type }>>;
}

export interface ClientOptions {
  token?: string;
  origin?: string;
}

export function openClient(url: string, options: ClientOptions): Promise<Client> {
  const socket = new WebSocket(addressOf(url, options.token), { origin: options.origin });
  const received: ServerFrame[] = [];
  let waiting: ((frame: ServerFrame) => void) | undefined;

  socket.on("message", (raw) => {
    const frame = serverFrameSchema.parse(JSON.parse(raw.toString()));

    if (!waiting) return void received.push(frame);
    waiting(frame);
  });

  const next = () =>
    new Promise<ServerFrame>((resolve, reject) => {
      const queued = received.shift();

      if (queued) return resolve(queued);
      const timer = setTimeout(() => reject(new Error("no frame came in time")), WAIT_MS);

      waiting = (frame) => {
        clearTimeout(timer);
        waiting = undefined;
        resolve(frame);
      };
    });

  async function nextOfType<Type extends ServerFrame["type"]>(type: Type): Promise<Extract<ServerFrame, { type: Type }>> {
    const frame = await next();

    return frame.type === type ? (frame as Extract<ServerFrame, { type: Type }>) : nextOfType(type);
  }

  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve({ socket, send: (frame) => socket.send(JSON.stringify(frame)), next, nextOfType }));
    socket.once("error", reject);
    socket.once("unexpected-response", (...[, response]) => reject(new Error(`refused with ${response.statusCode}`)));
  });
}

function addressOf(url: string, token: string | undefined): string {
  return token === undefined ? url : `${url}/?token=${token}`;
}

/** The HTTP status an upgrade is refused with. */
export function refusalStatus(url: string, options: ClientOptions): Promise<number> {
  return openClient(url, options).then(
    () => Promise.reject(new Error("the socket was accepted")),
    (cause: Error) => Number(/refused with (\d+)/.exec(cause.message)?.[1]),
  );
}

export const EXTRA_TEXT = "Also check the tests.\n";

const running: Studio[] = [];

/** A studio closed by `closeStartedStudios`; call that in `afterEach`. */
export async function startedStudio(options: Omit<StudioOptions, "port" | "hostKeys">): Promise<Studio> {
  const studio = await startStudio({ port: 0, hostKeys: [], ...options });

  running.push(studio);

  return studio;
}

export async function closeStartedStudios(): Promise<void> {
  await Promise.all(running.splice(0).map((studio) => studio.close()));
}

export async function connectedTo(files: readonly CollectionFile[]) {
  const dir = collectionOnDisk(files);
  const studio = await startedStudio({ dir, origins: [] });

  return { dir, client: await openClient(studio.url, { token: studio.token }) };
}

export const connectedToWorkerCollection = () => connectedTo(WORKER_COLLECTION);

/** Every frame from the next result up to and including `run.ended`. */
export async function framesUntilRunEnded(client: Client): Promise<ServerFrame[]> {
  const frames: ServerFrame[] = [await client.nextOfType("result")];

  while (frames.at(-1)?.type !== "run.ended") frames.push(await client.next());

  return frames;
}

const startedRunFrame = z.object({ type: z.literal("result"), result: z.object({ run: z.string() }) });

export function sendWorkRunStart(client: Client, folder: string): void {
  client.send({ id: "s1", type: "run.start", line: "flow", node: "work", fixture: { ticket: "ENG-1" }, folder, permission: "acceptEdits" });
}

export function runIdOf(startedFrame: ServerFrame): string {
  const { result } = startedRunFrame.parse(startedFrame);

  return result.run;
}

/** Starts flow/work with ticket ENG-1 in `folder` and gives the run id its result frame names. */
export async function startWorkRun(client: Client, folder: string): Promise<string> {
  sendWorkRunStart(client, folder);

  return runIdOf(await client.nextOfType("result"));
}

/** Starts the work run, waits for its first output, cancels it and gives the `run.ended` frame with the run id. */
export async function cancelledAfterFirstOutput(client: Client, folder: string) {
  const run = await startWorkRun(client, folder);

  await client.nextOfType("run.output");
  client.send({ id: "c1", type: "run.cancel", run });

  return { run, ended: await client.nextOfType("run.ended") };
}

/** Ends a work run of a claude running `script`, restarts the studio and gives the result frame its `run.read` after 0 answers. */
export async function readAnswerAfterRestart(script: string): Promise<Extract<ServerFrame, { type: "result" }>> {
  let answer: Extract<ServerFrame, { type: "result" }> | undefined;

  await withFakeClaude(script, async (client, folder, restart) => {
    const run = await startWorkRun(client, folder);

    await client.nextOfType("run.ended");
    const restarted = await restart();

    restarted.send({ id: "r1", type: "run.read", run, after: 0 });
    answer = await restarted.nextOfType("result");
  });

  return answer as Extract<ServerFrame, { type: "result" }>;
}

/** A scratch folder holding a `claude` that runs `script`, and the environment that puts it first on PATH; the caller removes the scratch. */
export function fakeClaudeScratch(prefix: string, script: string): { scratch: string; runEnv: Record<string, string> } {
  const scratch = mkdtempSync(join(tmpdir(), prefix));
  const bin = join(scratch, "bin");

  mkdirSync(bin);
  writeFileSync(join(bin, "claude"), script, { mode: 0o755 });

  return { scratch, runEnv: { PATH: `${bin}:${process.env.PATH}` } };
}

/** Runs `body` against a studio whose `claude` on PATH is `script`, past the hello frame. */
export async function withFakeClaude(
  script: string,
  body: (client: Client, folder: string, restart: () => Promise<Client>) => Promise<void>,
): Promise<void> {
  const { scratch, runEnv } = fakeClaudeScratch("floor-run-start-", script);
  const dir = collectionOnDisk(WORKER_COLLECTION);

  async function connectToNewStudio(): Promise<{ studio: Studio; client: Client }> {
    const studio = await startedStudio({ dir, runEnv });
    const client = await openClient(studio.url, { token: studio.token });

    await client.next();

    return { studio, client };
  }

  try {
    const first = await connectToNewStudio();

    await body(first.client, join(scratch, "folder"), async () => {
      running.splice(running.indexOf(first.studio), 1);
      await first.studio.close();

      return (await connectToNewStudio()).client;
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
