// The backend: one WebSocket server on the loopback address, a token and an origin check at the upgrade, a handler table for requests, and a watcher that pushes the collection again when a file changes.
import { randomBytes } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { basename, join, resolve } from "node:path";
import type { Duplex } from "node:stream";
import { enforce } from "@re-cinq/floor-assembly-lines";
import { collectionFilesIn, readAgentFile } from "@re-cinq/floor-pipeline";
import { WebSocket, WebSocketServer } from "ws";
import { PROTOCOL_VERSION, type ServerFrame } from "../protocol.js";
import type { CollectionView } from "../view.js";
import { collectionView } from "./collection-view.js";
import { upgradeRefusal, type UpgradeRefusal } from "./guard.js";
import { editedAgentText, textVersion, withOneNewline, type AgentEdit } from "./agent-file-text.js";
import { environmentOf } from "./environment-usage.js";
import { fixtureFilesIn } from "./fixture-files.js";
import { runFilesIn } from "./run-files.js";
import { answerFrame, type StudioContext } from "./requests.js";
import { isSkillPath, skillNamesIn } from "./skill-names.js";
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
  /** Environment laid over the studio's own for each process a run starts. */
  runEnv?: Record<string, string>;
}

export interface Studio {
  /** `ws://127.0.0.1:<port>`: the real port, the token not in it. */
  url: string;
  token: string;
  /** The sockets that passed the token and origin check and are still open. */
  pageCount(): number;
  close(): Promise<void>;
}

export async function startStudio(options: StudioOptions): Promise<Studio> {
  const { dir, hostKeys, origins = [] } = options;

  enforce((await stat(dir).catch(() => undefined))?.isDirectory(), `${dir} is not a directory`);
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  const readCollection = () => collectionRead(dir, hostKeys);

  const writeAgent = async (file: string, edit: AgentEdit) => {
    const path = join(dir, file);

    const text = editedAgentText(file, await readFile(path, "utf8"), edit);

    readAgentFile(basename(file, ".md"), text, hostKeys);
    await writeFile(path, text);
  };

  const context: StudioContext = { readCollection, writeAgent, writeExtra: (file, edit) => writeExtraFile(join(dir, file), edit), ...fixtureFilesIn(dir), ...runFilesIn(dir), runs: new Map(), runEnv: options.runEnv, broadcast: (frame) => sockets.clients.forEach((socket) => send(socket, frame)) };
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
    pageCount: () => sockets.clients.size,
    close: () => closed({ watcher, sockets, server, runs: context.runs }),
  };
}

async function collectionRead(dir: string, hostKeys: readonly string[]): Promise<CollectionView> {
  const files = (await collectionFilesIn(dir)).filter((file) => !isSkillPath(file.path));

  return { ...collectionView(files, hostKeys), folder: basename(resolve(dir)), skills: await skillNamesIn(dir), environment: environmentOf(files) };
}

async function writeExtraFile(path: string, { text, version }: { text: string; version: string }): Promise<void> {
  enforce(version === textVersion(await readFile(path, "utf8")), `${basename(path)} changed on disk since it was read`);
  await writeFile(path, withOneNewline(text));
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
  // ws closes the socket itself (1009 on an oversized frame); the listener only keeps the error from going unhandled.
  socket.on("error", () => undefined);
  socket.on("message", (frame) => void answerFrame(frame.toString(), context).then((answer) => send(socket, answer)));
}

function send(socket: WebSocket, frame: ServerFrame): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
}

async function pushCollection(sockets: WebSocketServer, readCollection: () => Promise<CollectionView>): Promise<void> {
  const frame: ServerFrame = await readCollection().then(
    (collection): ServerFrame => ({ type: "collection", collection }),
    (error: Error): ServerFrame => ({ type: "refused", reason: error.message }),
  );

  sockets.clients.forEach((socket) => send(socket, frame));
}

async function closed({ watcher, sockets, server, runs }: { watcher: { close(): void }; sockets: WebSocketServer; server: ReturnType<typeof createServer>; runs: StudioContext["runs"] }): Promise<void> {
  watcher.close();
  runs.forEach((record) => record.process?.cancel());
  sockets.clients.forEach((socket) => socket.close(GOING_AWAY, "the studio is stopping"));
  await new Promise<void>((resolve) => sockets.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
