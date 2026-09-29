// Station runs (docs/api_sketch.md, "Station runs"): read-only except for a visit's own records; a report itself still arrives as an event.
import type { Request, ResponseToolkit, Server } from "@hapi/hapi";
import type { Deps } from "../deps.js";
import { VISITS_TOO, refusalForVisit, type Credentials } from "../auth.js";
import { HTTP_CREATED } from "../http-status.js";
import { parseBody } from "../parse.js";
import { badRequest, forbidden, notFound } from "../problem.js";
import { createRecordsSchema, recordKindSchema } from "../schemas.js";
import { dateOf } from "./date-of.js";
import { isUuid } from "./own-visit.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function registerStationRunRoutes(server: Server, deps: Deps): void {
  server.route({ method: "GET", path: "/station-runs", handler: (request, toolkit) => list(deps, request, toolkit) });
  server.route({ method: "GET", path: "/station-runs/{id}", handler: (request, toolkit) => getOne(deps, request, toolkit) });
  server.route({ method: "POST", path: "/station-runs/{id}/records", options: { auth: VISITS_TOO }, handler: (request, toolkit) => createRecords(deps, request, toolkit) });
  server.route({ method: "GET", path: "/station-runs/{id}/records", options: { auth: VISITS_TOO }, handler: (request, toolkit) => listRecords(deps, request, toolkit) });
}

async function list(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const query = request.query as Record<string, string | undefined>;

  if (!query.run) return badRequest(toolkit, "filter required: run");
  const visits = await deps.runs.visits(query.run, { station: query.station, since: dateOf(query.since) });

  return { items: visits.filter((visit) => matches(visit, query)) };
}

async function getOne(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const visitId = request.params.id as string;
  const visit = isUuid(visitId) ? await deps.runs.visit(visitId) : null;

  if (!visit) return notFound(toolkit, `no station run "${visitId}"`);
  const counted = await deps.records.latest(visitId, "llm_call");

  return { ...visit, cost: counted ? costOf(counted.body) : null };
}

const SAID = ["text", "failed"];

// What the agent counted and what it cost, without what it said: that is the visit's report, and its records.
function costOf(counted: unknown): unknown {
  const kept = Object.entries(counted as Record<string, unknown>).filter(([name]) => !SAID.includes(name));

  return Object.fromEntries(kept);
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
