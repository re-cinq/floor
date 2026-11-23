// The backend: one WebSocket server on the loopback address, a token and an origin check at the upgrade, a handler table for requests, and a watcher that pushes the collection again when a file changes.
import { randomBytes } from "node:crypto";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { basename, resolve } from "node:path";
import type { Duplex } from "node:stream";
import { enforce } from "@re-cinq/floor-assembly-lines";
import { collectionFilesIn } from "@re-cinq/floor-pipeline";
import { WebSocket, WebSocketServer } from "ws";
import { PROTOCOL_VERSION, type ServerFrame } from "../protocol.js";
import type { CollectionView } from "../view.js";
import { collectionView } from "./collection-view.js";
import { upgradeRefusal, type UpgradeRefusal } from "./guard.js";
import { answerFrame, type StudioContext } from "./requests.js";
import { watchCollection } from "./watcher.js";

/** Never `0.0.0.0`: the backend writes files and starts processes. */
const LOOPBACK = "127.0.0.1";
const MAX_FRAME_BYTES = 4_194_304;
const TOKEN_BYTES = 32;
const GOING_AWAY = 1001;
const UPGRADE_REQUIRED = 426;

export interface StudioOptions {
  dir: string;
  /** 0 picks a free port. */
  port: number;
  hostKeys: readonly string[];
  /** The Origin of each page that may open the socket. A client that sends none is let in with the token. */
  origins?: readonly string[];
}

export interface Studio {
  /** `ws://127.0.0.1:<port>`: the real port, the token not in it. */
  url: string;
  token: string;
  close(): Promise<void>;
}

export async function startStudio(options: StudioOptions): Promise<Studio> {
  const { dir, hostKeys, origins = [] } = options;

  enforce((await stat(dir).catch(() => undefined))?.isDirectory(), `${dir} is not a directory`);
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  const folder = basename(resolve(dir));
  const readCollection = async () => ({ ...collectionView(await collectionFilesIn(dir), hostKeys), folder });
  const context: StudioContext = { readCollection };
  const server = createServer(refuseHttp);

  server.on("upgrade", (request, socket, head) => {
    const refusal = upgradeRefusal({ url: request.url, origin: request.headers.origin, token, origins });

    if (refusal) return void refuseUpgrade(socket, refusal);
    sockets.handleUpgrade(request, socket, head, (opened) => sockets.emit("connection", opened, request));
  });
  sockets.on("connection", (socket) => serve(socket, context));
  const watcher = watchCollection(dir, () => void pushCollection(sockets, readCollection));

  await new Promise<void>((resolve) => server.listen(options.port, LOOPBACK, resolve));

  return {
    url: `ws://${LOOPBACK}:${(server.address() as AddressInfo).port}`,
    token,
    close: () => closed({ watcher, sockets, server }),
  };
}

function refuseHttp(...given: [IncomingMessage, ServerResponse]): void {
  const [, response] = given;

  response.writeHead(UPGRADE_REQUIRED, { "Content-Type": "text/plain" });
  response.end("this is a WebSocket backend: open a socket with the launch token\n");
}

function refuseUpgrade(socket: Duplex, { status, reason }: UpgradeRefusal): void {
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
}

function serve(socket: WebSocket, context: StudioContext): void {
  send(socket, { type: "hello", version: PROTOCOL_VERSION });
  socket.on("message", (frame) => void answerFrame(frame.toString(), context).then((answer) => send(socket, answer)));
}

function send(socket: WebSocket, frame: ServerFrame): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
}

// A read that fails, say the folder is gone mid-edit, sends nothing: the next change reads again.
async function pushCollection(sockets: WebSocketServer, readCollection: () => Promise<CollectionView>): Promise<void> {
  const collection = await readCollection().catch(() => undefined);

  if (collection) sockets.clients.forEach((socket) => send(socket, { type: "collection", collection }));
}

async function closed({ watcher, sockets, server }: { watcher: { close(): void }; sockets: WebSocketServer; server: ReturnType<typeof createServer> }): Promise<void> {
  watcher.close();
  sockets.clients.forEach((socket) => socket.close(GOING_AWAY, "the studio is stopping"));
  await new Promise<void>((resolve) => sockets.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
