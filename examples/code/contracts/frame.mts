// Choose which runs a dashboard should reload when Floor sends a live notification.
import type { FloorFrame } from "@re-cinq/floor-contracts";

export function refreshTarget(
  // frame is one notification from the floor-wide stream. https://re-cinq.github.io/floor/sdk/contracts/#floorframe
  frame: FloorFrame,
): { scope: "all" } | { scope: "run"; id: string } {
  // After a gap the stream sends resync, so reload the list before applying more changes.
  if (frame.type === "resync") return { scope: "all" };

  return { scope: "run", id: frame.runId };
}
