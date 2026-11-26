// Keep a dashboard in sync when runs change across the floor.
import { createFloorClient, type FloorAccess } from "@re-cinq/floor-client";

export async function followRuns(
  // access supplies the Floor URL and the service token used for requests. https://re-cinq.github.io/floor/sdk/client/#flooraccess
  access: FloorAccess,
  // refresh is your callback: reload one run by ID, or reload the list when a resync supplies no ID. https://re-cinq.github.io/floor/sdk/client/#floorframe
  refresh: (id?: string) => Promise<void>,
  // signal lets the caller stop the subscription by aborting its controller. https://re-cinq.github.io/floor/sdk/client/#floorwatchoptions
  signal: AbortSignal,
) {
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
