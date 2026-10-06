// The live channel (docs/api_sketch.md, "Live"): one WebSocket is one run, watched, or the whole floor's runs by id. lore opens one when somebody subscribes and closes it when they unsubscribe; a browser never reaches the floor.
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { Server } from "@hapi/hapi";
import { WebSocketServer, type WebSocket } from "ws";
import { callerOf } from "../auth.js";
import type { LiveLimits } from "../config.js";
import type { Deps } from "../deps.js";
import { isUuid } from "../routes/own-visit.js";
import type { FloorFrame } from "@re-cinq/floor-contracts";
import { FloorFeed, type FloorViewer } from "./floor-feed.js";
import { RunFeed, type Frame, type Viewer } from "./run-feed.js";

const LIVE_PATH = /^\/assembly-runs\/([^/]+)\/live$/;
const FLOOR_PATH = "/assembly-runs/live";
const WHOLE_NUMBER = /^\d+$/;

export const BAD_CURSOR = { code: 4400, reason: "after must be a whole number" };
export const NO_SERVICE_TOKEN = { code: 4401, reason: "a run is watched with the service token" };
export const NO_SUCH_RUN = { code: 4404, reason: "no such run" };
export const TOO_MANY = { code: 4429, reason: "this run has all the viewers it may" };
const GOING_AWAY = { code: 1001, reason: "the floor is stopping" };

const LIMITS: LiveLimits = { viewersPerRun: 16, bufferedBytes: 4_194_304, pingMs: 25_000 };
/** A viewer says nothing the floor reads today, so it has no reason to say much. */
const MAX_SAID_BYTES = 4096;

type Asked = { watch: "floor"; authorization: string | undefined } | { watch: "run"; runId: string; after: string; authorization: string | undefined };
type AskedRun = Extract<Asked, { watch: "run" }>;

export function registerLiveSocket(server: Server, deps: Deps): void {
  const live = new LiveSocket(deps);

  server.listener.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => live.upgrade(request, socket, head));
  server.ext("onPreStop", () => live.close());
}

class LiveSocket {
  private readonly sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_SAID_BYTES });
  private readonly watched = new Map<string, number>();
  private readonly answered = new WeakSet<WebSocket>();
  private readonly limits: LiveLimits;
  private readonly pinging: NodeJS.Timeout;

  constructor(private readonly deps: Deps) {
    this.limits = { ...LIMITS, ...deps.config.live };
    this.pinging = setInterval(() => this.ping(), this.limits.pingMs);
    this.pinging.unref();
  }

  // Taken up even from a caller it will refuse: a close code is read by any client, a refused upgrade's status by few.
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const asked = askedOf(request);

    if (!asked) return void socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");

    return this.sockets.handleUpgrade(request, socket, head, (opened) => void (asked.watch === "floor" ? this.openedOnFloor(opened, asked) : this.opened(opened, asked)));
  }

  close(): void {
    clearInterval(this.pinging);
    this.sockets.clients.forEach((socket) => socket.close(GOING_AWAY.code, GOING_AWAY.reason));
  }

  private async opened(socket: WebSocket, asked: AskedRun): Promise<void> {
    const viewer = this.viewerOn(socket);

    this.hear(socket, viewer);
    const refusal = this.refusalFor(asked);

    if (refusal) return viewer.close(refusal);
    const run = isUuid(asked.runId) ? await this.deps.runs.get(asked.runId) : null;

    if (!run) return viewer.close(NO_SUCH_RUN);
    const feed = new RunFeed(this.deps, { run, after: Number(asked.after), viewer });

    this.count(run.id, 1);
    socket.on("close", () => this.left(run.id, feed));
    await feed.start().catch(() => socket.terminate());
  }

  private async openedOnFloor(socket: WebSocket, asked: Asked): Promise<void> {
    const viewer = this.viewerOn(socket);

    this.hear(socket, viewer);
    if (!this.isService(asked)) return viewer.close(NO_SERVICE_TOKEN);
    const feed = new FloorFeed(this.deps, viewer);

    socket.on("close", () => feed.stop());
    await feed.start().catch(() => socket.terminate());
  }

  // What a viewer says is reserved for a person's word to a running agent; today it is answered, and not read.
  private hear(socket: WebSocket, viewer: Viewer): void {
    this.answered.add(socket);
    socket.on("pong", () => this.answered.add(socket));
    socket.on("error", () => socket.terminate());
    socket.on("message", () => viewer.send({ type: "unsupported" }));
  }

  private isService(asked: Asked): boolean {
    return callerOf(asked.authorization, { ...this.deps.config, now: this.deps.now })?.kind === "service";
  }

  private refusalFor(asked: AskedRun): { code: number; reason: string } | null {
    if (!this.isService(asked)) return NO_SERVICE_TOKEN;
    if (!WHOLE_NUMBER.test(asked.after)) return BAD_CURSOR;
    const watching = this.watched.get(asked.runId) ?? 0;

    return watching >= this.limits.viewersPerRun ? TOO_MANY : null;
  }

  private left(runId: string, feed: RunFeed): void {
    feed.stop();
    this.count(runId, -1);
  }

  private count(runId: string, change: number): void {
    const watching = (this.watched.get(runId) ?? 0) + change;

    this.watched.set(runId, watching);
    if (watching === 0) this.watched.delete(runId);
  }

  // A viewer that reads slower than its run writes is dropped, not waited for: what waits for it is held in the floor's own memory. It comes back with its cursor.
  private viewerOn(socket: WebSocket): Viewer & FloorViewer {
    return {
      send: (frame: Frame | FloorFrame) => {
        if (socket.readyState !== socket.OPEN) return;
        if (socket.bufferedAmount > this.limits.bufferedBytes) return socket.terminate();
        socket.send(JSON.stringify(frame));
      },
      close: (why) => socket.close(why.code, why.reason),
    };
  }

  // A viewer that did not answer the last ping is gone, whatever its connection says.
  private ping(): void {
    this.sockets.clients.forEach((socket) => {
      if (this.answered.has(socket)) return this.askAgain(socket);

      return socket.terminate();
    });
  }

  private askAgain(socket: WebSocket): void {
    this.answered.delete(socket);
    socket.ping();
  }
}

function askedOf(request: IncomingMessage): Asked | null {
  const url = new URL(request.url ?? "/", "http://floor");
  const authorization = request.headers.authorization;

  if (url.pathname === FLOOR_PATH) return { watch: "floor", authorization };
  const runId = LIVE_PATH.exec(url.pathname)?.[1];

  return runId ? { watch: "run", runId, after: url.searchParams.get("after") ?? "0", authorization } : null;
}
