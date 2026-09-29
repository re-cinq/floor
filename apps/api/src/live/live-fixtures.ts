// For the live channel's tests: a real socket to a floor that really listens, and what it was sent until it closed.
import type { Server } from "@hapi/hapi";
import { WebSocket } from "ws";
import type { Deps } from "../deps.js";
import { workStarted } from "../test-fixtures.js";
import { SERVICE_TOKEN } from "../test-server.js";

export const FIXED_NOW = new Date("2026-01-01T00:00:00Z");
const PATIENCE_MS = 5000;
const NEVER_CLOSED = 0;

export interface Told {
  type: string;
  seq?: number;
  [field: string]: unknown;
}

export interface Watched {
  socket: WebSocket;
  frames: Told[];
  /** The code the floor closed with; 0 if it has not closed in five seconds. */
  closed: Promise<number>;
  /** The first frame of this type, from the start or once it comes; null if it has not come in five seconds. */
  told(type: string): Promise<Told | null>;
}

export interface Watching {
  floor: Server;
  runId: string;
  after?: string;
  token?: string;
}

export interface CaughtUp {
  runId: string;
  visitId: string;
  watched: Watched;
}

/** A run of the work line, watched from its start by a viewer that has caught up. */
export async function caughtUpOn(floor: Server, deps: Deps): Promise<CaughtUp> {
  const started = await workStarted(deps);
  const watched = watch({ floor, runId: started.runId });

  await watched.told("caught_up");

  return { ...started, watched };
}

export function watch(watching: Watching): Watched {
  const { floor, runId, after = "0", token = SERVICE_TOKEN } = watching;
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const socket = new WebSocket(`ws://localhost:${floor.info.port}/assembly-runs/${runId}/live?after=${after}`, { headers });
  const frames: Told[] = [];
  const waiting: { type: string; tell: (frame: Told) => void }[] = [];

  socket.on("message", (said: Buffer) => {
    const frame = JSON.parse(said.toString()) as Told;

    frames.push(frame);
    waiting.filter((waited) => waited.type === frame.type).forEach((waited) => waited.tell(frame));
  });

  return { socket, frames, closed: closedOf(socket), told: (type) => toldOf(type, { frames, waiting }) };
}

function closedOf(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    socket.on("close", (code) => resolve(code));
    socket.on("error", () => undefined);
    setTimeout(() => resolve(NEVER_CLOSED), PATIENCE_MS).unref();
  });
}

interface Heard {
  frames: Told[];
  waiting: { type: string; tell: (frame: Told) => void }[];
}

function toldOf(type: string, heard: Heard): Promise<Told | null> {
  const already = heard.frames.find((frame) => frame.type === type);

  if (already) return Promise.resolve(already);

  return new Promise((resolve) => {
    heard.waiting.push({ type, tell: resolve });
    setTimeout(() => resolve(null), PATIENCE_MS).unref();
  });
}

export function typesOf(watched: Watched): string[] {
  return watched.frames.map((frame) => `${frame.seq ?? ""} ${frame.type}`.trim());
}
