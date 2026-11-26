// Follow one run until it settles so a caller can read its outcome without polling.
import { createFloorClient, type FloorAccess, type RunWatch } from "@re-cinq/floor-client";

export async function watchOutcome(access: FloorAccess, runId: string) {
  const watch = createFloorClient(access).runs.watch(runId);

  try {
    return await settlement(watch);
  } finally {
    watch.stop();
  }
}

async function settlement(watch: RunWatch) {
  // The stream replays earlier frames before delivering live updates.
  for await (const frame of watch) {
    if (frame.type === "run_settled") return frame.run.outcome;
  }

  throw new Error(`Watch ended before settlement: ${(await watch.ended).reason}`);
}
