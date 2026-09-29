// Schedules (docs/api_sketch.md, "Schedules"): a name, a cron and an event payload, holding exactly one pending event. Handling its tick enqueues the next occurrence.
import { CronExpressionParser } from "cron-parser";
import { definitionHash } from "@floor/assembly-lines";
import type { DefinitionsStore, PutResult } from "./definitions.js";
import type { EventStore, FloorEvent } from "./events.js";
import type { ScheduleBody } from "./types.js";

export interface SchedulesStoreDeps {
  definitions: DefinitionsStore;
  events: EventStore;
  now: () => Date;
}

export class SchedulesStore {
  constructor(private readonly deps: SchedulesStoreDeps) {}

  /** Stores the version and enqueues the first occurrence; an existing schedule's old pending event is dropped first. A body identical to the current latest is a no-op, leaving the pending event untouched, so a repeated create never resets the timer. */
  async put(name: string, body: ScheduleBody, createdBy?: string): Promise<PutResult> {
    const current = await this.deps.definitions.latest<ScheduleBody>("schedule", name);
    const hash = definitionHash(body);

    if (current?.hash === hash) return { hash, created: false };

    await this.deps.events.dropByName(tickName(name));
    const result = await this.deps.definitions.put("schedule", name, body, createdBy);

    await this.enqueueTick(name, body, nextOccurrence(body, this.deps.now()));

    return result;
  }

  /** Archives the schedule and drops its pending event. */
  async remove(name: string): Promise<void> {
    await this.deps.events.dropByName(tickName(name));
    await this.deps.definitions.archive("schedule", name);
  }

  async pending(name: string): Promise<FloorEvent | null> {
    return this.deps.events.pendingByName(tickName(name));
  }

  /** One extra event, now; does not touch the pending occurrence. Null for a schedule that is missing or archived. */
  async trigger(name: string): Promise<FloorEvent | null> {
    const schedule = await this.deps.definitions.latest<ScheduleBody>("schedule", name);

    if (!schedule) return null;

    return this.enqueueTick(name, schedule.body, this.deps.now());
  }

  /** The occurrence following `after`; null for a schedule that is missing or archived, so a tick for one no longer live enqueues nothing. */
  async enqueueNext(name: string, after: Date): Promise<FloorEvent | null> {
    const schedule = await this.deps.definitions.latest<ScheduleBody>("schedule", name);

    if (!schedule) return null;

    return this.enqueueTick(name, schedule.body, nextOccurrence(schedule.body, after));
  }

  private async enqueueTick(name: string, body: ScheduleBody, scheduledFor: Date): Promise<FloorEvent> {
    return this.deps.events.enqueue({
      name: tickName(name),
      payload: { ...body.payload, scheduledFor: scheduledFor.toISOString() },
      availableAt: scheduledFor,
      dedupeKey: `schedule:${name}:${scheduledFor.toISOString()}`,
    });
  }
}

function tickName(name: string): string {
  return `schedule.${name}.tick`;
}

function nextOccurrence(body: ScheduleBody, after: Date): Date {
  // eslint-disable-next-line id-length -- cron-parser's own option name
  const interval = CronExpressionParser.parse(body.cron, { currentDate: after, tz: body.timezone ?? "UTC" });

  return interval.next().toDate();
}

export function isValidCron(cron: string): boolean {
  try {
    // eslint-disable-next-line id-length -- cron-parser's own option name
    CronExpressionParser.parse(cron, { tz: "UTC" });

    return true;
  } catch {
    return false;
  }
}

export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });

    return true;
  } catch {
    return false;
  }
}
