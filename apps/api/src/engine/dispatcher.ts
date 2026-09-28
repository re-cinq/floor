// The floor's own loop body (docs/assembly_run_storage.md, "Events: the queue and the loop"): claim every event that is not a worker's, turn it into one store call, ack it.
import { Refusal, type AssemblyRunStore, type EventStore, type FloorEvent } from "@floor/store";
import { WORKER_EVENT_NAMES } from "../worker-events.js";
import { routeEvent, type Route } from "./route.js";

const DEFAULT_BATCH_SIZE = 20;

export interface DispatcherDeps {
  runs: AssemblyRunStore;
  events: EventStore;
  claimedBy: string;
  batchSize?: number;
}

type RunEvent = Extract<Route, { kind: "run-event" }>;

export class Dispatcher {
  constructor(private readonly deps: DispatcherDeps) {}

  /** One pass over the queue; returns how many events it handled, so a caller knows whether to go again at once. */
  async tick(): Promise<number> {
    const claimed = await this.deps.events.claimExcept({
      excludedNames: WORKER_EVENT_NAMES,
      limit: this.deps.batchSize ?? DEFAULT_BATCH_SIZE,
      claimedBy: this.deps.claimedBy,
    });

    for (const event of claimed) {
      await this.handle(event);
    }

    return claimed.length;
  }

  private async handle(event: FloorEvent): Promise<void> {
    try {
      await this.apply(event, routeEvent(event));
      await this.deps.events.ack(event.id);
    } catch (error) {
      await this.giveUpOrRetry(event, error);
    }
  }

  private async apply(event: FloorEvent, route: Route): Promise<void> {
    if (route.kind === "invalid") throw new Refusal(route.reason);
    if (route.kind === "report") await this.deps.runs.report(route.visitId, route.report, route.worker);
    if (route.kind === "run-event") await this.startNode(event.name, route);
  }

  private async startNode(eventName: string, start: RunEvent): Promise<void> {
    const nodeId = await this.deps.runs.nodeStartedBy(start.runId, eventName);

    if (!nodeId) return;

    try {
      await this.open(nodeId, eventName, start);
    } catch (error) {
      await this.failRunThatCannotGoOn(start.runId, error);
      throw error;
    }
  }

  // The walk posts an iteration; a person or an outside system does not, and that is what makes it a start by hand.
  private async open(nodeId: string, eventName: string, start: RunEvent): Promise<void> {
    if (start.iteration) {
      await this.deps.runs.openVisit(start.runId, nodeId, start.iteration);

      return;
    }

    await this.deps.runs.openVisitByHand(start.runId, nodeId, start.requestedBy ?? eventName);
  }

  // A node the store refuses to open would leave its run with nothing open and nothing queued, waiting forever.
  private async failRunThatCannotGoOn(runId: string, error: unknown): Promise<void> {
    if (!(error instanceof Refusal)) return;
    const run = await this.deps.runs.get(runId);

    if (run && !run.finishedAt) await this.deps.runs.fail(runId, error.message);
  }

  private async giveUpOrRetry(event: FloorEvent, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof Refusal) {
      await this.deps.events.deadLetter(event.id, message);

      return;
    }

    await this.deps.events.fail(event.id, message);
  }
}
