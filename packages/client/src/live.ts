// One run, watched as it happens. The floor replays its journal from a cursor and then tails it, so a watch that drops and comes back with its last seq misses nothing — this comes back for you.
import type { LiveFrame } from "@re-cinq/floor-contracts";
import type { Reachable } from "./send.js";

/** The floor terminates a viewer it cannot reach, and a dropped connection reports the same code. */
export const CLOSE = { settled: 1000, stopping: 1001, dropped: 1006, unreadable: 1011, badCursor: 4400, noServiceToken: 4401, noSuchRun: 4404, tooManyViewers: 4429 } as const;

const REFUSALS = [CLOSE.badCursor, CLOSE.noServiceToken, CLOSE.noSuchRun, CLOSE.tooManyViewers] as const;
const BACKOFF_START_MS = 250;
const BACKOFF_CAP_MS = 10_000;

export type RefusalCode = (typeof REFUSALS)[number];

export type WatchEnd = { reason: "settled" } | { reason: "stopped" } | { reason: "refused"; code: RefusalCode; detail: string };

export interface Closed {
  code: number;
  reason: string;
}

/** The seam, in this package's own shape rather than the browser's: a test drives it with no server and no port. */
export interface LiveSocket {
  onFrame(heard: (frame: string) => void): void;
  onClosed(heard: (closed: Closed) => void): void;
  close(code?: number, reason?: string): void;
}

export type SocketFn = (url: string, init: { headers: Record<string, string> }) => LiveSocket;

export type LiveReachable = Reachable & { socketFn?: SocketFn };

export interface WatchOptions {
  /** The last seq already seen. Left out, the run is replayed from its start. */
  after?: number;
  /** False leaves every close to the caller. */
  reconnect?: boolean;
  /** Attempt to delay. Return 0 in a test. */
  backoffMs?: (attempt: number) => number;
  signal?: AbortSignal;
}

export interface RunWatch extends AsyncIterable<LiveFrame> {
  /** The last seq handed out. Give it to the next watch and lose nothing. */
  readonly seq: number;
  readonly ended: Promise<WatchEnd>;
  stop(): void;
}

export function watchRun(floor: LiveReachable, runId: string, options: WatchOptions = {}): RunWatch {
  const cursor = { seq: cursorOf(options.after) };
  const feed = openFeed<LiveFrame>((frame) => {
    if (frame.type !== "unsupported") cursor.seq = frame.seq;
  });

  options.signal?.addEventListener("abort", () => feed.stop());
  void follow({ floor, options, watch: feed, urlFor: () => liveUrl(floor.url, runId, cursor.seq) });

  return {
    get seq() {
      return cursor.seq;
    },
    ended: feed.ended,
    stop: feed.stop,
    [Symbol.asyncIterator]: () => feed[Symbol.asyncIterator](),
  };
}

/** What one watch holds while it runs: the frames not yet handed out, the socket, and whether it is over. */
export interface Feed<Frame> extends AsyncIterable<Frame> {
  readonly waiting: Frame[];
  readonly socket: { current: LiveSocket | null };
  readonly ended: Promise<WatchEnd>;
  endedYet(): WatchEnd | null;
  take(frame: Frame): void;
  settle(end: WatchEnd): void;
  stop(): void;
}

export function openFeed<Frame>(onTake: (frame: Frame) => void = () => {}): Feed<Frame> {
  const held = { end: null as WatchEnd | null };
  const waiting: Frame[] = [];
  const socket: { current: LiveSocket | null } = { current: null };
  const { sleep, wake } = sleeper();
  const { ended, finish } = promised();

  const settle = (end: WatchEnd): void => {
    if (held.end) return;
    held.end = end;
    finish(end);
    wake();
  };

  return {
    waiting,
    ended,
    socket,
    endedYet: () => held.end,
    settle,
    take: (frame) => {
      onTake(frame);
      waiting.push(frame);
      wake();
    },
    stop: () => {
      socket.current?.close(CLOSE.settled, "the watcher stopped");
      settle({ reason: "stopped" });
    },
    [Symbol.asyncIterator]: () => handOut(waiting, { endedYet: () => held.end, sleep }),
  };
}

/** A reader waiting on the next frame, woken when one arrives or when the watch is over. */
function sleeper(): { sleep: () => Promise<void>; wake: () => void } {
  let waking: (() => void) | null = null;

  return {
    sleep: () =>
      new Promise<void>((resolve) => {
        waking = resolve;
      }),
    wake: () => {
      const woken = waking;

      waking = null;
      woken?.();
    },
  };
}

function promised(): { ended: Promise<WatchEnd>; finish: (end: WatchEnd) => void } {
  let finish!: (end: WatchEnd) => void;
  const ended = new Promise<WatchEnd>((resolve) => {
    finish = resolve;
  });

  return { ended, finish };
}

function handOut<Frame>(waiting: Frame[], watch: { endedYet(): WatchEnd | null; sleep(): Promise<void> }): AsyncIterator<Frame> {
  return {
    async next(): Promise<IteratorResult<Frame>> {
      while (waiting.length === 0) {
        if (watch.endedYet()) return { value: undefined, done: true };
        await watch.sleep();
      }

      return { value: waiting.shift()!, done: false };
    },
  };
}

type Reconnecting = Pick<WatchOptions, "reconnect" | "backoffMs">;

interface Following<Frame> {
  floor: LiveReachable;
  options: Reconnecting;
  watch: Feed<Frame>;
  /** The address for this attempt: a run's moves with its cursor, the floor's does not. */
  urlFor(): string;
}

export async function follow<Frame>(following: Following<Frame>): Promise<void> {
  const { options, watch } = following;
  let attempt = 0;

  while (!watch.endedYet()) {
    const closed = await connected(following);
    const end = endFor(closed, options);

    if (watch.endedYet()) return;
    if (end) return watch.settle(end);

    await new Promise((resolve) => setTimeout(resolve, delayFor(attempt, options.backoffMs)));
    attempt += 1;
  }
}

// Settled is the end; a refusal will be refused again; anything else is worth coming back from.
function endFor(closed: Closed, options: Reconnecting): WatchEnd | null {
  if (closed.code === CLOSE.settled) return { reason: "settled" };
  if (refused(closed.code)) return { reason: "refused", code: closed.code, detail: closed.reason };

  return options.reconnect === false ? { reason: "stopped" } : null;
}

function connected<Frame>(following: Following<Frame>): Promise<Closed> {
  const { floor, watch } = following;
  const open = floor.socketFn ?? defaultSocket;
  const socket = open(following.urlFor(), { headers: { authorization: `Bearer ${floor.token}` } });

  watch.socket.current = socket;

  return new Promise((resolve) => {
    socket.onFrame((said) => {
      const frame = frameOf<Frame>(said);

      if (frame) watch.take(frame);
    });
    socket.onClosed(resolve);
  });
}

function refused(code: number): code is RefusalCode {
  return (REFUSALS as readonly number[]).includes(code);
}

// A whole number is what the floor accepts; anything else spends a connection to be told 4400.
function cursorOf(after: number | undefined): number {
  return Math.max(0, Math.trunc(after ?? 0));
}

function delayFor(attempt: number, backoffMs: WatchOptions["backoffMs"]): number {
  return backoffMs ? backoffMs(attempt) : Math.min(BACKOFF_CAP_MS, BACKOFF_START_MS * 2 ** attempt);
}

function liveUrl(base: string, runId: string, after: number): string {
  return `${base.replace(/^http/, "ws")}/assembly-runs/${runId}/live?after=${after}`;
}

function frameOf<Frame>(said: string): Frame | null {
  try {
    return JSON.parse(said) as Frame;
  } catch {
    return null;
  }
}

// Node 22's global WebSocket takes headers through undici's options bag, which is the only way the floor sees the token: it reads the upgrade's authorization header and has no query fallback.
function defaultSocket(url: string, init: { headers: Record<string, string> }): LiveSocket {
  const socket = new WebSocket(url, init as unknown as string[]);

  return {
    onFrame: (heard) => socket.addEventListener("message", (said) => heard(String(said.data))),
    onClosed: (heard) => socket.addEventListener("close", (closed) => heard({ code: closed.code, reason: closed.reason })),
    close: (code, reason) => socket.close(code, reason),
  };
}
