// Follow one run until it settles so a caller can read its outcome without polling.
import { createFloorClient, type FloorAccess, type RunWatch } from "@re-cinq/floor-client";

export async function watchOutcome(
  // access supplies the Floor URL and the service token used for requests. https://re-cinq.github.io/floor/sdk/client/#flooraccess
  access: FloorAccess,
  // runId selects the assembly run to follow; use the ID returned when you start it. https://re-cinq.github.io/floor/sdk/client/#startedrun
  runId: string,
) {
  const watch = createFloorClient(access).runs.watch(runId);

  try {
    return await settlement(watch);
  } finally {
    watch.stop();
  }
}

// watch supplies the replay and live frames for the selected run. https://re-cinq.github.io/floor/sdk/client/#runwatch
async function settlement(watch: RunWatch) {
  // The stream replays earlier frames before delivering live updates.
  for await (const frame of watch) {
    if (frame.type === "run_settled") return frame.run.outcome;
  }

  throw new Error(`Watch ended before settlement: ${(await watch.ended).reason}`);
}
