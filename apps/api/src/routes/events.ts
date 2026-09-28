// The queue (docs/api_sketch.md, "Events"): the feed workers poll and claim, and the one write path a visit token is trusted with.
import type { Request, ResponseToolkit, Server } from "@hapi/hapi";
import type { Deps } from "../deps.js";
import type { Credentials } from "../auth.js";
import { HTTP_CREATED, HTTP_NO_CONTENT } from "../http-status.js";
import { parseBody } from "../parse.js";
import { badRequest, forbidden, notFound } from "../problem.js";
import { claimEventsSchema, enqueueEventSchema, failEventSchema } from "../schemas.js";
import { WORKER_EVENT_NAMES } from "../worker-events.js";



export function registerEventRoutes(server: Server, deps: Deps): void {
  server.route({ method: "GET", path: "/events", handler: (request, toolkit) => listByRun(deps, request, toolkit) });
  server.route({ method: "GET", path: "/events/{id}", handler: (request, toolkit) => getOne(deps, request, toolkit) });
  server.route({ method: "POST", path: "/events", handler: (request, toolkit) => enqueue(deps, request, toolkit) });
  server.route({ method: "POST", path: "/events/claim", handler: (request, toolkit) => claim(deps, request, toolkit) });
  server.route({ method: "POST", path: "/events/{id}/ack", handler: (request, toolkit) => ack(deps, request, toolkit) });
  server.route({ method: "POST", path: "/events/{id}/fail", handler: (request, toolkit) => fail(deps, request, toolkit) });
}

async function listByRun(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const query = request.query as Record<string, string | undefined>;

  if (!query.run) return badRequest(toolkit, "filter required: run (since, name and station-run are not yet supported)");

  return { items: await deps.events.listByRun(query.run) };
}

async function getOne(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const event = await deps.events.get(request.params.id as string);

  return event ?? notFound(toolkit, `no event "${request.params.id}"`);
}

async function enqueue(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const parsed = parseBody(enqueueEventSchema, request.payload);

  if (!parsed.success) return badRequest(toolkit, "invalid event", parsed.errors);
  const credentials = request.auth.credentials as Credentials;
  const guarded = guardVisitPost(credentials, parsed.value);

  if (guarded) return forbidden(toolkit, guarded);
  const event = await deps.events.enqueue(parsed.value);

  return toolkit.response(event).code(HTTP_CREATED);
}

async function claim(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const parsed = parseBody(claimEventsSchema, request.payload);

  if (!parsed.success) return badRequest(toolkit, "invalid claim request", parsed.errors);
  const workerHeader = request.headers["x-worker-id"];
  const claimedBy = typeof workerHeader === "string" ? workerHeader : request.info.remoteAddress;
  const claimed = await deps.events.claim({ names: WORKER_EVENT_NAMES, tags: parsed.value.tags, limit: parsed.value.limit, claimedBy });

  return claimed.length > 0 ? claimed : toolkit.response().code(HTTP_NO_CONTENT);
}

async function ack(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  await deps.events.ack(request.params.id as string);

  return toolkit.response().code(HTTP_NO_CONTENT);
}

async function fail(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const parsed = parseBody(failEventSchema, request.payload);

  if (!parsed.success) return badRequest(toolkit, "invalid fail request", parsed.errors);
  const id = request.params.id as string;
  const failure = parsed.value;

  await (failure.permanent ? deps.events.deadLetter(id, failure.error) : deps.events.fail(id, failure.error));

  return toolkit.response().code(HTTP_NO_CONTENT);
}

function guardVisitPost(credentials: Credentials, event: { name: string; payload: Record<string, unknown> }): string | null {
  if (credentials.kind !== "visit") return null;
  if (event.name !== "station_run.reported") return "a visit token may only post station_run.reported";
  if (event.payload.visitId !== credentials.visitId) return "a visit token may only post for its own visit";

  return null;
}
