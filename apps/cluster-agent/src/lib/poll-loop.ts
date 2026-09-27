// The unbounded polling loop: tick forever, react, sleep a chosen delay; ported verbatim from lore's lib/poll-loop.ts. See ../../README.md.

/** min(baseMs * 2^attempts, maxMs). A negative attempt count floors at the base. */
export function backoffDelay(
  baseMs: number,
  attempts: number,
  maxMs: number,
): number {
  return Math.min(baseMs * 2 ** Math.max(0, attempts), maxMs);
}

export interface PollLoopDeps<Outcome> {
  tick: () => Promise<Outcome>;
  /** Awaited before the sleep, so a side effect completes before the next tick. */
  onOutcome?: (outcome: Outcome) => void | Promise<void>;
  /** The delay to sleep after this outcome; `idleTicks` counts consecutive idle outcomes BEFORE this one, so only the second-and-later idle grows the delay. */
  delayFor: (outcome: Outcome, idleTicks: number) => number;
  /** Omitted = nothing is idle, so `idleTicks` stays 0 and the delay is flat. */
  isIdle?: (outcome: Outcome) => boolean;
  sleep: (delayMs: number) => Promise<void>;
  /** Tests bound the loop; production runs forever. */
  running?: () => boolean;
}

export async function runPollLoop<Outcome>(
  deps: PollLoopDeps<Outcome>,
): Promise<void> {
  const running = deps.running ?? ((): boolean => true);
  const isIdle = deps.isIdle ?? ((): boolean => false);
  let idleTicks = 0;

  while (running()) {
    const outcome = await deps.tick();

    await deps.onOutcome?.(outcome);

    const delayMs = deps.delayFor(outcome, idleTicks);

    idleTicks = isIdle(outcome) ? idleTicks + 1 : 0;
    await deps.sleep(delayMs);
  }
}
