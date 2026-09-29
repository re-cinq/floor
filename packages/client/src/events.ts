// The queue: what a worker claims from, and what anything posts to. Nothing is pushed — every worker offers its tags and takes what matches.
import type { ClaimedEvent, FloorEventView } from "@re-cinq/floor-contracts";
import type { EventFilter } from "./filters.js";
import { asked, done, type Reachable } from "./send.js";

const HTTP_NOT_FOUND = 404;

export interface EnqueueEvent {
  name: string;
  payload: Record<string, unknown>;
  /** The same key twice is the same event: a redelivered webhook enqueues once. */
  dedupeKey?: string;
  availableAt?: Date;
  runId?: string;
}

export interface EventsPage {
  items: FloorEventView[];
  nextCursor: string | null;
}

export interface EventsApi {
  feed(filter: EventFilter, page?: { limit?: number }): Promise<EventsPage>;
  get(eventId: string): Promise<FloorEventView | null>;
  post(event: EnqueueEvent): Promise<FloorEventView>;
  /** Empty when nothing matching the tags is waiting. */
  claim(claiming: { tags: string[]; limit: number }): Promise<ClaimedEvent[]>;
  ack(eventId: string): Promise<void>;
  /** Back on the queue after a backoff, and dead-lettered once it has been tried too often. */
  fail(eventId: string, error: string): Promise<void>;
  /** Straight to the dead letters: trying again would never help. */
  deadLetter(eventId: string, error: string): Promise<void>;
}

export function eventsApi(floor: Reachable): EventsApi {
  const refused = async (eventId: string, body: { error: string; permanent: boolean }): Promise<void> => {
    await done(floor, { method: "POST", path: `/events/${eventId}/fail`, body });
  };

  return {
    feed: async (filter, page) => (await asked<EventsPage>(floor, { method: "GET", path: "/events", query: { ...filter, ...page } }))!,
    get: (eventId) => asked<FloorEventView>(floor, { method: "GET", path: `/events/${eventId}` }, [HTTP_NOT_FOUND]),
    post: async (event) => (await asked<FloorEventView>(floor, { method: "POST", path: "/events", body: { ...event, availableAt: event.availableAt?.toISOString() } }))!,
    claim: async (claiming) => (await asked<ClaimedEvent[]>(floor, { method: "POST", path: "/events/claim", body: claiming })) ?? [],
    ack: async (eventId) => {
      await done(floor, { method: "POST", path: `/events/${eventId}/ack` });
    },
    fail: (eventId, error) => refused(eventId, { error, permanent: false }),
    deadLetter: (eventId, error) => refused(eventId, { error, permanent: true }),
  };
}
