// The claim loop otherwise logs only on error, stop, or a fatal crash: 11+ hours of silence in production reads the same as wedged. This says the loop is alive, at most once a minute.
import type { ClaimTickOutcome } from "../claim-loop.js";

export const LIVENESS_LOG_INTERVAL_MS = 60_000;

/** `lastLoggedAt` is null before the first log; a minute is measured against `now`, both in epoch ms so a test never needs the wall clock. */
export function dueForLivenessLog(lastLoggedAt: number | null, now: number, intervalMs: number = LIVENESS_LOG_INTERVAL_MS): boolean {
  return lastLoggedAt === null || now - lastLoggedAt >= intervalMs;
}

/** What a tick claimed, in one greppable phrase: idle, or how many of each outcome kind. */
export function describeClaimTick(outcomes: ClaimTickOutcome[]): string {
  if (outcomes.length === 0) return "idle, claimed nothing";

  return `claimed ${outcomes.length} (${outcomes.map((outcome) => outcome.kind).join(", ")})`;
}
