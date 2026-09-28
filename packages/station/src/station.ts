// defineStation: the loop around one function. It claims the station's own dispatches, works each visit, and acks; the floor never calls in.
import { Floor, type Claimed } from "./floor.js";
import type { Handle, RunningStation, StationOptions } from "./types.js";
import { workVisit } from "./visit.js";

const DEFAULT_IDLE_MS = 2000;
const DEFAULT_CLAIM_LIMIT = 1;

export function defineStation(name: string, handle: Handle, options: StationOptions = {}): RunningStation {
  const station = new Station(name, handle, options);

  if (options.start !== false) station.start();

  return station;
}

class Station implements RunningStation {
  private readonly floor: Floor;
  private stopped = true;
  private wake: () => void = () => undefined;
  private running: Promise<void> = Promise.resolve();

  constructor(
    private readonly name: string,
    private readonly handle: Handle,
    private readonly options: StationOptions,
  ) {
    this.floor = new Floor({ floorUrl: required(options.floorUrl, "FLOOR_API_URL"), token: required(options.token, "FLOOR_SERVICE_TOKEN") });
  }

  start(): void {
    this.stopped = false;
    this.running = this.untilStopped();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.wake();
    await this.running;
  }

  async once(): Promise<number> {
    const claimed = await this.floor.claim([`station:${this.name}`], this.options.claimLimit ?? DEFAULT_CLAIM_LIMIT);

    for (const event of claimed) {
      await this.take(event);
    }

    return claimed.length;
  }

  // Rests only after finding nothing: a queue with more in it should not wait.
  private async untilStopped(): Promise<void> {
    while (!this.stopped) {
      const found = await this.once().catch((error: unknown) => this.survived(error));

      if (found === 0) await this.rest();
    }
  }

  private rest(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, this.options.idleMs ?? DEFAULT_IDLE_MS);

      this.wake = (): void => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  private survived(error: unknown): number {
    this.options.onError?.(error);

    return 0;
  }

  // An abort says the visit is over and asks the worker to let go. A service holds nothing between visits, so there is nothing to do but say it was heard.
  private async take(event: Claimed): Promise<void> {
    try {
      if (event.name === "station_run.dispatch") await workVisit({ floor: this.floor, station: this.name, handle: this.handle }, event.payload.visitId);
      await this.floor.ack(event.id);
    } catch (error) {
      this.options.onError?.(error);
      await this.floor.fail(event.id, error instanceof Error ? error.message : String(error));
    }
  }
}

function required(given: string | undefined, variable: string): string {
  const found = given ?? process.env[variable];

  if (!found) throw new Error(`a station needs ${variable}, or the option that replaces it`);

  return found;
}
