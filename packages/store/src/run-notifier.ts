// Who is told when a run's journal grows. Postgres tells every connection that listens, so a viewer on one replica hears of what was written through another. One connection listens for the whole process, outside the pool: a pool hands a connection back, and a listener must keep its own.
import postgres from "pg";

const CHANNEL = "floor_run_feed";
const FIRST_RETRY_MS = 250;
const LONGEST_RETRY_MS = 10_000;
const BACKOFF = 2;

export interface RunListener {
  /** The run's journal has something new. */
  changed: () => void;
  /** Notices may have been missed, the connection having been lost: read the journal again from your own cursor. */
  resync: () => void;
}

export interface RunNotifier {
  /** Resolves once listening, so nothing written after it is missed. Returns how to stop. */
  subscribe(runId: string, listener: RunListener): Promise<() => void>;
  close(): Promise<void>;
}

export interface PgRunNotifierDeps {
  connectionString: string;
  /** How long to wait before the first try at listening again; doubled each time after. */
  retryMs?: number;
  onError?: (error: unknown) => void;
}

export const LISTENER_NAME = "floor-run-listener";

export class PgRunNotifier implements RunNotifier {
  private readonly listeners = new Map<string, Set<RunListener>>();
  private listening: Promise<void> | null = null;
  private client: postgres.Client | null = null;
  private schema = "";
  private closed = false;
  private retryMs: number;

  constructor(private readonly deps: PgRunNotifierDeps) {
    this.retryMs = deps.retryMs ?? FIRST_RETRY_MS;
  }

  async subscribe(runId: string, listener: RunListener): Promise<() => void> {
    const ofRun = this.listeners.get(runId) ?? new Set<RunListener>();

    ofRun.add(listener);
    this.listeners.set(runId, ofRun);
    this.listening ??= this.listen();
    await this.listening;

    return () => this.forget(runId, listener);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.listeners.clear();
    await this.client?.end();
  }

  private forget(runId: string, listener: RunListener): void {
    const ofRun = this.listeners.get(runId);

    ofRun?.delete(listener);
    if (ofRun?.size === 0) this.listeners.delete(runId);
  }

  private async listen(): Promise<void> {
    const client = new postgres.Client({ connectionString: this.deps.connectionString, application_name: LISTENER_NAME });

    client.on("notification", (notice) => this.heard(notice.payload ?? ""));
    client.on("error", (error) => this.deps.onError?.(error));
    client.on("end", () => this.lost());
    await client.connect();
    const found = await client.query(`select current_schema() as schema`);

    this.schema = (found.rows[0] as { schema: string }).schema;
    await client.query(`listen ${CHANNEL}`);
    this.client = client;
  }

  // A database holds more than one floor, a schema each, and a notice is the database's: one from another schema is another floor's.
  private heard(payload: string): void {
    const told = JSON.parse(payload) as { schema: string; run: string };

    if (told.schema !== this.schema) return;
    this.listeners.get(told.run)?.forEach((listener) => listener.changed());
  }

  private lost(): void {
    if (this.closed) return;
    const wait = this.retryMs;

    this.retryMs = Math.min(wait * BACKOFF, LONGEST_RETRY_MS);
    setTimeout(() => void this.listenAgain(), wait);
  }

  private async listenAgain(): Promise<void> {
    if (this.closed) return;

    try {
      await this.listen();
      this.retryMs = this.deps.retryMs ?? FIRST_RETRY_MS;
      this.listeners.forEach((ofRun) => ofRun.forEach((listener) => listener.resync()));
    } catch (error) {
      this.deps.onError?.(error);
      this.lost();
    }
  }
}
