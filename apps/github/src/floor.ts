// The floor, as the receiver reaches it: one call, to post an event.
import type { FloorEvent } from "./floor-event.js";

const REQUEST_TIMEOUT_MS = 30_000;

export function floorPoster(floorUrl: string, token: string): (event: FloorEvent) => Promise<void> {
  return async (event) => {
    const response = await fetch(`${floorUrl}/events`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`the floor answered ${response.status}: ${await response.text()}`);
  };
}
