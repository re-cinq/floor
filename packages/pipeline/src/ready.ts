// The floor answers /readyz once it can serve. A deploy hook runs when the floor's pods are created, not when they are ready.
import { setTimeout as sleep } from "node:timers/promises";

const MS_PER_SECOND = 1000;
const DEFAULT_POLL_MS = 2000;
const PROBE_TIMEOUT_MS = 5000;

export interface Waiting {
  floorUrl: string;
  seconds: number;
  pollMs?: number;
}

export async function waitUntilReady(waiting: Waiting): Promise<void> {
  const { floorUrl, seconds, pollMs = DEFAULT_POLL_MS } = waiting;
  const deadline = performance.now() + seconds * MS_PER_SECOND;

  while (!(await answersReady(floorUrl))) {
    if (performance.now() + pollMs > deadline) throw new Error(`the floor at ${floorUrl} did not answer ready in ${seconds} seconds`);
    await sleep(pollMs);
  }
}

async function answersReady(floorUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${floorUrl}/readyz`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });

    return response.ok;
  } catch {
    return false;
  }
}
