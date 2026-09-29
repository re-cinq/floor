// Schedules (docs/api_sketch.md, "Schedules"): a name, a cron and an event payload. A service's alone, as every route is that does not say otherwise.
import type { Request, ResponseToolkit, Server } from "@hapi/hapi";
import { z } from "zod";
import type { ScheduleBody } from "@floor/store";
import type { Deps } from "../deps.js";
import { HTTP_CREATED, HTTP_NO_CONTENT } from "../http-status.js";
import { parseBody } from "../parse.js";
import { badRequest, notFound } from "../problem.js";
import { scheduleBodySchema } from "../schemas.js";

const idSchema = z.intersection(z.object({ id: z.string() }), scheduleBodySchema);

export function registerScheduleRoutes(server: Server, deps: Deps): void {
  server.route({ method: "GET", path: "/schedules", handler: () => listSchedules(deps) });
  server.route({ method: "GET", path: "/schedules/{id}", handler: (request, toolkit) => getSchedule(deps, request, toolkit) });
  server.route({ method: "POST", path: "/schedules", handler: (request, toolkit) => createSchedule(deps, request, toolkit) });
  server.route({ method: "PUT", path: "/schedules/{id}", handler: (request, toolkit) => putSchedule(deps, request, toolkit) });
  server.route({ method: "DELETE", path: "/schedules/{id}", handler: (request, toolkit) => deleteSchedule(deps, request, toolkit) });
  server.route({ method: "POST", path: "/schedules/{id}/trigger", handler: (request, toolkit) => triggerSchedule(deps, request, toolkit) });
}

async function listSchedules(deps: Deps) {
  return { items: await deps.definitions.listLatest<ScheduleBody>("schedule") };
}

async function getSchedule(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const id = request.params.id as string;
  const row = await deps.definitions.latest<ScheduleBody>("schedule", id);

  if (!row) return notFound(toolkit, `no schedule "${id}"`);

  return { ...row, pending: await deps.schedules.pending(id) };
}

async function createSchedule(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const parsed = parseBody(idSchema, request.payload);

  if (!parsed.success) return badRequest(toolkit, "invalid schedule body", parsed.errors);
  const { id, ...body } = parsed.value;

  return toolkit.response(await deps.schedules.put(id, body)).code(HTTP_CREATED);
}

async function putSchedule(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const parsed = parseBody(scheduleBodySchema, request.payload);

  if (!parsed.success) return badRequest(toolkit, "invalid schedule body", parsed.errors);

  return deps.schedules.put(request.params.id as string, parsed.value);
}

async function deleteSchedule(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  await deps.schedules.remove(request.params.id as string);

  return toolkit.response().code(HTTP_NO_CONTENT);
}

async function triggerSchedule(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const id = request.params.id as string;
  const event = await deps.schedules.trigger(id);

  return event ?? notFound(toolkit, `no schedule "${id}"`);
}
