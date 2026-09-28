// Station runs (docs/api_sketch.md, "Station runs"): read-only except for a visit's own records; a report itself still arrives as an event.
import type { Request, ResponseToolkit, Server } from "@hapi/hapi";
import type { Deps } from "../deps.js";
import { refusalForVisit, type Credentials } from "../auth.js";
import { HTTP_CREATED } from "../http-status.js";
import { parseBody } from "../parse.js";
import { badRequest, forbidden, notFound } from "../problem.js";
import { createRecordsSchema, recordKindSchema } from "../schemas.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function registerStationRunRoutes(server: Server, deps: Deps): void {
  server.route({ method: "GET", path: "/station-runs", handler: (request, toolkit) => list(deps, request, toolkit) });
  server.route({ method: "GET", path: "/station-runs/{id}", handler: (request, toolkit) => getOne(deps, request, toolkit) });
  server.route({ method: "POST", path: "/station-runs/{id}/records", handler: (request, toolkit) => createRecords(deps, request, toolkit) });
  server.route({ method: "GET", path: "/station-runs/{id}/records", handler: (request, toolkit) => listRecords(deps, request, toolkit) });
}

async function list(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const query = request.query as Record<string, string | undefined>;

  if (!query.run) return badRequest(toolkit, "filter required: run");
  const visits = await deps.runs.visits(query.run);

  return { items: visits.filter((visit) => matches(visit, query)) };
}

async function getOne(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const visit = await deps.runs.visit(request.params.id as string);

  return visit ?? notFound(toolkit, `no station run "${request.params.id}"`);
}

async function createRecords(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const parsed = parseBody(createRecordsSchema, request.payload);

  if (!parsed.success) return badRequest(toolkit, "invalid records", parsed.errors);
  const visitId = request.params.id as string;
  const guarded = refusalForVisit(request.auth.credentials as Credentials, visitId);

  if (guarded) return forbidden(toolkit, guarded);

  try {
    const appended = await deps.records.append(visitId, parsed.value.records);

    return toolkit.response({ items: appended }).code(HTTP_CREATED);
  } catch (error) {
    return badRequest(toolkit, error instanceof Error ? error.message : "could not append the record(s)");
  }
}

async function listRecords(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const query = request.query as Record<string, string | undefined>;

  if (!query.kind) return badRequest(toolkit, "filter required: kind");
  const kind = recordKindSchema.safeParse(query.kind);

  if (!kind.success) return badRequest(toolkit, `invalid kind "${query.kind}"`);
  const visitId = request.params.id as string;
  const guarded = refusalForVisit(request.auth.credentials as Credentials, visitId);

  if (guarded) return forbidden(toolkit, guarded);

  return deps.records.list(visitId, kind.data, { after: sinceOf(query.since), limit: limitOf(query.limit) });
}

function sinceOf(value: string | undefined): number | undefined {
  const parsed = value === undefined ? undefined : Number(value);

  return parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
}

function limitOf(value: string | undefined): number {
  const parsed = value ? Number(value) : DEFAULT_LIMIT;

  return Number.isFinite(parsed) ? Math.min(parsed, MAX_LIMIT) : DEFAULT_LIMIT;
}

function matches(visit: { nodeId: string; report: unknown }, query: Record<string, string | undefined>): boolean {
  return matchesNode(visit, query.node) && matchesOpen(visit, query.open);
}

function matchesNode(visit: { nodeId: string }, node: string | undefined): boolean {
  return !node || visit.nodeId === node;
}

function matchesOpen(visit: { report: unknown }, open: string | undefined): boolean {
  if (open === "true") return visit.report === null;
  if (open === "false") return visit.report !== null;

  return true;
}
