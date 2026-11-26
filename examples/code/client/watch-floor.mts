// Keep a dashboard in sync when runs change across the floor.
import { createFloorClient, type FloorAccess } from "@re-cinq/floor-client";

export async function followRuns(access: FloorAccess, refresh: (id?: string) => Promise<void>, signal: AbortSignal) {
  const watch = createFloorClient(access).runs.watchFloor({ signal });

  try {
    for await (const frame of watch) {
      // A resync requests a fresh list; a run notification identifies just one row.
      await refresh(frame.type === "resync" ? undefined : frame.runId);
    }
  } finally {
    watch.stop();
  }
}
