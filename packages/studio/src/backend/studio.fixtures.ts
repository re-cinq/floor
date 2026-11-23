import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import WebSocket from "ws";
import type { CollectionFile } from "@re-cinq/floor-pipeline";
import { serverFrameSchema, type ServerFrame } from "../protocol.js";

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
