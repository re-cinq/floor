// The whole floor, watched as it happens: which runs start and change. The floor opens every connection with a resync, so a watch that drops comes back with nothing to remember.
import type { FloorFrame } from "@re-cinq/floor-contracts";
import { follow, openFeed, type LiveReachable, type WatchEnd } from "./live.js";

export interface FloorWatchOptions {
  /** False leaves every close to the caller. */
  reconnect?: boolean;
  /** Attempt to delay. Return 0 in a test. */
  backoffMs?: (attempt: number) => number;
  signal?: AbortSignal;
}

export interface FloorWatch extends AsyncIterable<FloorFrame> {
  readonly ended: Promise<WatchEnd>;
  stop(): void;
}

export function watchFloor(floor: LiveReachable, options: FloorWatchOptions = {}): FloorWatch {
  const watch = openFeed<FloorFrame>();

  options.signal?.addEventListener("abort", () => watch.stop());
  void follow({ floor, options, watch, urlFor: () => `${floor.url.replace(/^http/, "ws")}/assembly-runs/live` });

  return watch;
}
