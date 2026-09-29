// One viewer's feed of one run (docs/api_sketch.md, "Live"): what the journal already holds, from the viewer's own cursor, and then what it comes to hold, as it does.
import type { JournalEntry, Run, RunJournal, RunNotifier, StationRunRecord, Visit } from "@floor/store";

export type Frame =
  | { type: "record"; seq: number; visitId: string; nodeId: string; iteration: number; record: StationRunRecord }
  | { type: "visit_opened" | "visit_reported"; seq: number; visit: Visit }
  | { type: "run_settled"; seq: number; run: Run }
  | { type: "caught_up"; seq: number }
  | { type: "unsupported" };

export const SETTLED = { code: 1000, reason: "the run settled" };
export const FAILED = { code: 1011, reason: "the floor could not read the run" };

export interface Viewer {
  send(frame: Frame): void;
  close(why: { code: number; reason: string }): void;
}

export interface RunFeedDeps {
  journal: RunJournal;
  notifier: RunNotifier;
}

export interface Viewing {
  run: Run;
  /** The last seq the viewer has seen; 0 for one that has seen nothing. */
  after: number;
  viewer: Viewer;
}

const PAGE = 200;

export class RunFeed {
  private cursor: number;
  private reading: Promise<void> | null = null;
  private hasMore = false;
  private stopped = false;
  private stopListening: () => void = () => undefined;

  constructor(
    private readonly deps: RunFeedDeps,
    private readonly viewing: Viewing,
  ) {
    this.cursor = viewing.after;
  }

  /** Listens before it reads, so nothing written between the two is missed. */
  async start(): Promise<void> {
    const readOn = (): void => void this.read();

    this.stopListening = await this.deps.notifier.subscribe(this.viewing.run.id, { changed: readOn, resync: readOn });
    await this.read();
    if (this.stopped) return;
    this.viewing.viewer.send({ type: "caught_up", seq: this.cursor });
    // A run settled before it had a journal has no settling in it, and nothing more will come.
    if (this.viewing.run.finishedAt) this.end(SETTLED);
  }

  stop(): void {
    this.stopped = true;
    this.stopListening();
  }

  // One read at a time, so no entry is sent twice; told of more while reading, it reads once more.
  private read(): Promise<void> {
    this.hasMore = true;
    this.reading ??= this.readAll().finally(() => (this.reading = null));

    return this.reading;
  }

  private async readAll(): Promise<void> {
    try {
      while (this.hasMore && !this.stopped) {
        this.hasMore = false;
        await this.readToTheEnd();
      }
    } catch {
      this.end(FAILED);
    }
  }

  private async readToTheEnd(): Promise<void> {
    let nextCursor: number | null = this.cursor;

    while (nextCursor !== null && !this.stopped) {
      const page = await this.deps.journal.since(this.viewing.run.id, this.cursor, PAGE);

      page?.items.forEach((entry) => this.tell(entry));
      nextCursor = page?.nextCursor ?? null;
    }
  }

  private tell(entry: JournalEntry): void {
    if (this.stopped) return;
    this.viewing.viewer.send(frameOf(entry));
    this.cursor = entry.seq;
    if (entry.kind === "run_settled") this.end(SETTLED);
  }

  private end(why: { code: number; reason: string }): void {
    if (this.stopped) return;
    this.stop();
    this.viewing.viewer.close(why);
  }
}

export function frameOf(entry: JournalEntry): Frame {
  if (entry.kind === "run_settled") return { type: entry.kind, seq: entry.seq, run: entry.run };
  if (entry.kind !== "record") return { type: entry.kind, seq: entry.seq, visit: entry.visit };
  const { id, nodeId, iteration } = entry.visit;

  return { type: "record", seq: entry.seq, visitId: id, nodeId, iteration, record: entry.record };
}
