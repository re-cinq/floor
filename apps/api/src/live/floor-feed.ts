// One viewer's feed of the whole floor (docs/api_sketch.md, "Live"): which runs start and change, by id, as they do.
import type { FloorFrame } from "@re-cinq/floor-contracts";
import type { RunNotifier } from "@floor/store";

export interface FloorViewer {
  send(frame: FloorFrame): void;
}

export class FloorFeed {
  private stopped = false;
  private stopListening: () => void = () => undefined;

  constructor(
    private readonly deps: { notifier: RunNotifier },
    private readonly viewer: FloorViewer,
  ) {}

  /** Listens before it says `resync`, so nothing started after the viewer hears it is missed. */
  async start(): Promise<void> {
    const stopListening = await this.deps.notifier.subscribeFloor({
      told: ({ run, kind }) => this.viewer.send({ type: kind === "run_started" ? "run_started" : "run_changed", runId: run }),
      resync: () => this.viewer.send({ type: "resync" }),
    });

    if (this.stopped) return stopListening();
    this.stopListening = stopListening;
    this.viewer.send({ type: "resync" });
  }

  stop(): void {
    this.stopped = true;
    this.stopListening();
  }
}
