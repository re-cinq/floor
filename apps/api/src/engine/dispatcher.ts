// The floor's own loop body (docs/assembly_run_storage.md, "Events: the queue and the loop"): claim every event that is not a worker's, turn it into store calls, ack it.
import {
  Refusal,
  type AssemblyRunStore,
  type EventStore,
  type FloorEvent,
  type OutsideEvent,
  type OutsideEvents,
  type Run,
  type SchedulesStore,
} from "@floor/store";
import { WORKER_EVENT_NAMES } from "../worker-events.js";
import { routeEvent, type Route } from "./route.js";

const DEFAULT_BATCH_SIZE = 20;
const TICK_NAME = /^schedule\.(.+)\.tick$/;

export interface DispatcherDeps {
  runs: AssemblyRunStore;
  events: EventStore;
  outside: OutsideEvents;
  schedules: SchedulesStore;
  claimedBy: string;
  batchSize?: number;
}

type RunEvent = Extract<Route, { kind: "run-event" }>;

interface NodeStart {
  runId: string;
  nodeId: string;
  iteration?: number;
  requestedBy: string;
}

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
    if (route.kind === "report") return this.report(route);
    const outside = outsideEvent(event);

    if (route.kind === "run-event" && (await this.startedNode(outside, route))) return;

    await this.deps.outside.startLines(outside);
    await this.advanceScheduleIfTick(event);
  }

  // A schedule that was archived between posting this tick and handling it enqueues nothing further.
  private async advanceScheduleIfTick(event: FloorEvent): Promise<void> {
    const name = TICK_NAME.exec(event.name)?.[1];

    if (!name) return;

    await this.deps.schedules.enqueueNext(name, scheduledForOf(event));
  }

  private async report(route: Extract<Route, { kind: "report" }>): Promise<void> {
    await this.deps.runs.report(route.visitId, route.report, route.worker);
  }

  /** True when the event was a node's start in the run it names. When it was not, the run's waiting nodes get to take it as their answer. */
  private async startedNode(event: OutsideEvent, start: RunEvent): Promise<boolean> {
    const run = await this.runNamedBy(start);

    if (!run) return false;
    const nodeId = await this.deps.runs.nodeStartedBy(run.id, event.name);

    if (!nodeId) {
      await this.deps.outside.answer(run, event);

      return false;
    }

    await this.openOrFailRun({ runId: run.id, nodeId, iteration: start.iteration, requestedBy: start.requestedBy ?? event.name });

    return true;
  }

  // A run id that finds nothing is a mistake worth keeping; a subject that finds nothing is only a run that is not open.
  private async runNamedBy(start: RunEvent): Promise<Run | null> {
    const run = await this.deps.outside.runFor(start.run);

    if (!run && "runId" in start.run) throw new Refusal(`no run "${start.run.runId}"`);

    return run;
  }

  private async openOrFailRun(start: NodeStart): Promise<void> {
    try {
      await this.open(start);
    } catch (error) {
      await this.failRunThatCannotGoOn(start.runId, error);
      throw error;
    }
  }

  // The walk posts an iteration; a person or an outside system does not, and that is what makes it a start by hand.
  private async open(start: NodeStart): Promise<void> {
    const opened = start.iteration
      ? await this.deps.runs.openVisit(start.runId, start.nodeId, start.iteration)
      : await this.deps.runs.openVisitByHand(start.runId, start.nodeId, start.requestedBy);

    if (opened.created) console.log(`floor dispatcher: run ${start.runId} opened node ${start.nodeId}`);
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

function outsideEvent(event: FloorEvent): OutsideEvent {
  const payload = event.payload;
  const isRecord = typeof payload === "object" && payload !== null && !Array.isArray(payload);

  return { name: event.name, payload: isRecord ? (payload as Record<string, unknown>) : {} };
}

function scheduledForOf(event: FloorEvent): Date {
  return new Date((event.payload as { scheduledFor: string }).scheduledFor);
}
