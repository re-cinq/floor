// The floor's loop (docs/assembly_run_storage.md): it runs only on the instance holding the single-instance lease, and gives up the work the moment the lease is gone.
import { acquireLease, type Lease, type PgPool } from "@floor/store";
import type { Deps } from "../deps.js";
import { Dispatcher } from "./dispatcher.js";
import { Sweeper } from "./sweep.js";

const MAX_DRAINS_PER_PASS = 50;
const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 3_600_000;
const REAP_AFTER_MS = HOURS_PER_DAY * MS_PER_HOUR;

export interface LoopDeps {
  pool: PgPool;
  dispatcher: Pick<Dispatcher, "tick">;
  sweeper: Pick<Sweeper, "sweep">;
  /** Absent in a loop that has no blobs to look after. */
  reaper?: Chore;
  now: () => Date;
  leaseKey: bigint;
  pollMs: number;
  sweepMs: number;
  onError?: (error: unknown) => void;
}

/** Work done now and then, not on every pass. */
export interface Chore {
  everyMs: number;
  run(): Promise<unknown>;
}

export class FloorLoop {
  private lease: Lease | null = null;
  private sweptAt: Date | null = null;
  private reapedAt: Date | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> = Promise.resolve();
  private stopped = true;

  constructor(private readonly deps: LoopDeps) {}

  holdsLease(): boolean {
    return this.lease !== null;
  }

  /** One turn: hold the lease or do nothing; drain the queue; sweep when it is due. */
  async pass(): Promise<void> {
    if (!(await this.ensureLease())) return;

    await this.drain();
    await this.sweepIfDue();
    await this.reapIfDue();
  }

  start(): void {
    this.stopped = false;
    this.schedule(0);
  }

  /** Waits for the pass in flight, then gives the lease up so another instance can take over at once. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
    await this.lease?.release();
    this.lease = null;
  }

  private schedule(delayMs: number): void {
    this.timer = setTimeout(() => {
      this.running = this.passThenScheduleNext();
    }, delayMs);
  }

  private async passThenScheduleNext(): Promise<void> {
    try {
      await this.pass();
    } catch (error) {
      this.deps.onError?.(error);
    }

    if (!this.stopped) this.schedule(this.deps.pollMs);
  }

  private async ensureLease(): Promise<boolean> {
    if (this.lease && !(await this.lease.isHeld())) this.lease = null;

    this.lease ??= await acquireLease(this.deps.pool, this.deps.leaseKey);

    return this.lease !== null;
  }

  // Bounded, so a queue that refills as fast as it empties cannot starve the sweep.
  private async drain(): Promise<void> {
    for (let drains = 0; drains < MAX_DRAINS_PER_PASS; drains++) {
      if ((await this.deps.dispatcher.tick()) === 0) return;
    }
  }

  private async sweepIfDue(): Promise<void> {
    const now = this.deps.now();

    if (!isDue(this.sweptAt, now, this.deps.sweepMs)) return;

    this.sweptAt = now;
    await this.deps.sweeper.sweep();
  }

  private async reapIfDue(): Promise<void> {
    const reaper = this.deps.reaper;
    const now = this.deps.now();

    if (!reaper || !isDue(this.reapedAt, now, reaper.everyMs)) return;

    this.reapedAt = now;
    await reaper.run();
  }
}

function isDue(last: Date | null, now: Date, everyMs: number): boolean {
  return !last || now.getTime() - last.getTime() >= everyMs;
}

export function buildLoop(deps: Deps, claimedBy: string): FloorLoop {
  return new FloorLoop({
    pool: deps.pool,
    dispatcher: new Dispatcher({ runs: deps.runs, events: deps.events, outside: deps.outside, schedules: deps.schedules, claimedBy }),
    sweeper: new Sweeper({ runs: deps.runs, events: deps.events, now: deps.now }),
    reaper: reaperOf(deps),
    now: deps.now,
    leaseKey: deps.config.leaseKey,
    pollMs: deps.config.pollMs,
    sweepMs: deps.config.sweepMs,
    onError: (error) => {
      console.error("floor loop: a pass failed and will be tried again", error);
    },
  });
}

// Blobs older than a day that nothing names. A day is longer than any visit's deadline, so nothing a visit still running has uploaded is old enough.
function reaperOf(deps: Deps): Chore {
  return {
    everyMs: deps.config.reapMs,
    run: () => deps.blobs.reapUnreferenced(new Date(deps.now().getTime() - REAP_AFTER_MS)),
  };
}
