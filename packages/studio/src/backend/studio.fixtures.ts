import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import WebSocket from "ws";
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

/** Runs `body` against a studio whose `claude` on PATH is `script`, past the hello frame. */
export async function withFakeClaude(
  script: string,
  body: (client: Client, folder: string, restart: () => Promise<Client>) => Promise<void>,
): Promise<void> {
  const scratch = mkdtempSync(join(tmpdir(), "floor-run-start-"));
  const bin = join(scratch, "bin");
  const dir = collectionOnDisk(WORKER_COLLECTION);

  async function connectToNewStudio(): Promise<{ studio: Studio; client: Client }> {
    const studio = await startedStudio({ dir, runEnv: { PATH: `${bin}:${process.env.PATH}` } });
    const client = await openClient(studio.url, { token: studio.token });

    await client.next();

    return { studio, client };
  }

  try {
    mkdirSync(bin);
    writeFileSync(join(bin, "claude"), script, { mode: 0o755 });
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
