// The floor's own timeout loop: an overdue visit fails as a timeout; a dispatch no worker ever claimed fails its visit and dead-letters the event.
import { Refusal, type AssemblyRunStore, type EventStore, type FloorEvent } from "@floor/store";

export interface SweeperDeps {
  runs: AssemblyRunStore;
  events: EventStore;
  now: () => Date;
}

export class Sweeper {
  constructor(private readonly deps: SweeperDeps) {}

  /** One pass over overdue visits and unclaimed dispatches; returns how many it swept. */
  async sweep(): Promise<number> {
    return (await this.sweepOverdueVisits()) + (await this.sweepUnclaimedDispatches());
  }

  private async sweepOverdueVisits(): Promise<number> {
    const visits = await this.deps.runs.overdueVisits(this.deps.now());

    for (const visit of visits) {
      await this.failVisit(visit.id, "timeout");
    }

    return visits.length;
  }

  private async sweepUnclaimedDispatches(): Promise<number> {
    const dispatches = await this.deps.events.unclaimedDispatches(this.deps.now());

    for (const dispatch of dispatches) {
      await this.failUnclaimedDispatch(dispatch);
    }

    return dispatches.length;
  }

  private async failUnclaimedDispatch(dispatch: FloorEvent): Promise<void> {
    const error = `unclaimed: no worker offers ${dispatch.tags.join(", ")}`;

    await this.failVisit(visitIdOf(dispatch), error);
    await this.deps.events.deadLetter(dispatch.id, error);
  }

  // A Refusal here means someone else's report already closed the visit; retrying it cannot help, so the sweep moves on.
  private async failVisit(visitId: string, error: string): Promise<void> {
    try {
      await this.deps.runs.report(visitId, { outcome: "failed", error });
    } catch (err) {
      if (!(err instanceof Refusal)) throw err;
    }
  }
}

function visitIdOf(event: FloorEvent): string {
  return (event.payload as { visitId: string }).visitId;
}
