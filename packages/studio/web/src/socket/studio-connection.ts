// The page's one link to the backend: a WebSocket opened with the launch token, every frame checked against the protocol's schema, requests matched to their answers by id, and a reconnect with backoff that reads the collection again. Pushes are not replayed, so a connection that drops and returns asks again.
import type { ZodError } from "zod";
import { collectionFrame, PROTOCOL_VERSION, serverFrameSchema, type CollectionView, type Request, type ServerFrame } from "@protocol";

export type ConnectionState =
  | { status: "connecting" }
  | { status: "open" }
  | { status: "closed"; reason: string; retrying: boolean }
  | { status: "refused"; reason: string };

export interface StudioSnapshot {
  connection: ConnectionState;
  collection: CollectionView | null;
  /** Why the backend could not read the collection, when it said so. */
  readError: string | null;
}

export interface ConnectionOptions {
  /** The backend's `ws://` address, without the token. */
  socket: string;
  token: string;
  /** Milliseconds to wait before attempt number `attempt` (0 for the first retry). */
  retryDelay?: (attempt: number) => number;
}

const FIRST_RETRY_MS = 500;
const LONGEST_RETRY_MS = 10_000;
const PROBE_TIMEOUT_MS = 2000;
const UNREACHABLE = "cannot reach the studio";
const DROPPED = "the connection to the studio dropped";
const collectionSchema = collectionFrame.shape.collection;

/** What one socket has been through, so its end can be told apart from a refused handshake. */
interface Attempt {
  opened: boolean;
  ended: boolean;
}

const backoff = (attempt: number): number => Math.min(FIRST_RETRY_MS * 2 ** attempt, LONGEST_RETRY_MS);

interface Waiting {
  resolve: (result: unknown) => void;
  reject: (reason: Error) => void;
}

export class StudioConnection {
  private current: StudioSnapshot = { connection: { status: "connecting" }, collection: null, readError: null };
  private readonly listeners = new Set<() => void>();
  private readonly waiting = new Map<string, Waiting>();
  private socket: WebSocket | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private attempt = 0;
  private requests = 0;
  private stopped = false;

  constructor(private readonly options: ConnectionOptions) {}

  /** The same object until something changes, so a React store can compare it. */
  snapshot(): StudioSnapshot {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  start(): void {
    this.stopped = false;
    this.open();
  }

  close(): void {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.socket?.close();
    this.change({ connection: { status: "closed", reason: "closed by the page", retrying: false } });
  }

  /** Sends a request and resolves with the `result` of the frame that carries its id; rejects with the reason of a `refused` one. */
  request(type: Request["type"]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.requests += 1;
      const id = `r${this.requests}`;

      this.waiting.set(id, { resolve, reject });
      this.socket?.send(JSON.stringify({ id, type }));
    });
  }

  private change(part: Partial<StudioSnapshot>): void {
    this.current = { ...this.current, ...part };
    this.listeners.forEach((listener) => listener());
  }

  private open(): void {
    const address = this.addressOf();

    if (!address) {
      return this.change({ connection: { status: "closed", reason: `the socket address ${this.options.socket} is not a valid address`, retrying: false } });
    }

    this.change({ connection: { status: "connecting" } });
    const socket = new WebSocket(address);
    const attempt: Attempt = { opened: false, ended: false };

    // A failed handshake ends in `error` and `close` in a browser, and in `error` alone in Node.
    const end = () => {
      if (!attempt.ended) void this.dropped(socket, attempt);
      attempt.ended = true;
    };

    this.socket = socket;
    socket.onopen = () => (attempt.opened = true);
    socket.onmessage = (event) => this.receive(socket, event.data);
    socket.onerror = end;
    socket.onclose = end;
  }

  private addressOf(): string | undefined {
    const { socket, token } = this.options;

    if (!URL.canParse(socket) || !/^wss?:/.test(socket)) return undefined;
    const address = new URL(socket);

    address.pathname = "/";
    address.searchParams.set("token", token);

    return address.toString();
  }

  private receive(socket: WebSocket, raw: unknown): void {
    const frame = typeof raw === "string" ? readFrame(raw) : { problem: "it was not text" };

    if ("problem" in frame) return this.stop(socket, { status: "closed", reason: `the studio sent a frame this page cannot read: ${frame.problem}`, retrying: false });
    if (frame.type === "hello") return this.greeted(socket, frame.version);
    if (frame.type === "collection") return this.change({ collection: frame.collection, readError: null });
    this.answer(frame);
  }

  private greeted(socket: WebSocket, version: number): void {
    if (version !== PROTOCOL_VERSION) {
      return this.stop(socket, { status: "refused", reason: `the studio speaks protocol ${version} and this page speaks ${PROTOCOL_VERSION}` });
    }

    this.attempt = 0;
    this.change({ connection: { status: "open" } });
    void this.readCollection();
  }

  private answer(frame: Extract<ServerFrame, { type: "result" | "refused" }>): void {
    const waiting = frame.id === undefined ? undefined : this.waiting.get(frame.id);

    if (frame.id !== undefined) this.waiting.delete(frame.id);
    if (frame.type === "result") return waiting?.resolve(frame.result);
    waiting?.reject(new Error(frame.reason));
  }

  private async readCollection(): Promise<void> {
    const result = await this.request("collection.read").then(
      (held) => collectionSchema.safeParse(held),
      (reason: Error) => ({ success: false as const, error: reason }),
    );

    if (this.stopped) return;
    if (result.success) return this.change({ collection: result.data, readError: null });
    this.change({ readError: result.error.message });
  }

  /** Ends this socket for a reason that retrying cannot fix. */
  private stop(socket: WebSocket, state: ConnectionState): void {
    this.stopped = true;
    socket.close();
    this.change({ connection: state });
  }

  private async dropped(socket: WebSocket, attempt: Attempt): Promise<void> {
    this.waiting.forEach(({ reject }) => reject(new Error("the connection closed")));
    this.waiting.clear();
    if (this.stopped || socket !== this.socket) return;
    if (!attempt.opened && (await this.answersPlainHttp())) return this.refuse(socket);
    this.retryLater(attempt.opened ? DROPPED : UNREACHABLE);
  }

  private refuse(socket: WebSocket): void {
    this.stop(socket, {
      status: "refused",
      reason: "the studio is running but refused the connection: the token in this address is not the one it was started with, or this page's origin is not allowed. Open the address `floor-studio` printed.",
    });
  }

  private retryLater(reason: string): void {
    if (this.stopped) return;
    this.change({ connection: { status: "closed", reason, retrying: true } });
    this.retryTimer = setTimeout(() => this.open(), (this.options.retryDelay ?? backoff)(this.attempt++));
  }

  /** A browser says no more of a refused upgrade than that it failed. A server that answers a plain request is up, so a failed upgrade there is a refusal; one that does not is not running. */
  private async answersPlainHttp(): Promise<boolean> {
    const address = new URL(this.options.socket.replace(/^ws/, "http"));

    return fetch(address, { mode: "no-cors", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) }).then(
      () => true,
      () => false,
    );
  }
}

function readFrame(text: string): ServerFrame | { problem: string } {
  const parsed = serverFrameSchema.safeParse(parseJson(text));

  return parsed.success ? parsed.data : { problem: firstIssue(parsed.error) };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A failed parse always names at least one issue. */
function firstIssue({ issues }: ZodError): string {
  const [issue] = issues;

  return issue.message;
}
