// Assembly runs (docs/api_sketch.md, "Assembly runs"): read-only plus cancel; a run is otherwise only created by start.
import type { Request, ResponseToolkit, Server } from "@hapi/hapi";
import { z } from "zod";
import { Refusal, type RunFilter } from "@floor/store";
import type { Deps } from "../deps.js";
import { parseBody } from "../parse.js";
import { badRequest, notFound } from "../problem.js";
import { dateOf } from "./date-of.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const cancelSchema = z.object({ reason: z.string() });

export function registerRunRoutes(server: Server, deps: Deps): void {
  server.route({ method: "GET", path: "/assembly-runs", handler: (request, toolkit) => list(deps, request, toolkit) });
  server.route({ method: "GET", path: "/assembly-runs/{id}", handler: (request, toolkit) => getOne(deps, request, toolkit) });
  server.route({ method: "POST", path: "/assembly-runs/{id}/cancel", handler: (request, toolkit) => cancel(deps, request, toolkit) });
}

async function list(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const query = request.query as Record<string, string | undefined>;
  const filter: RunFilter = { lineId: query.line, repo: repoOf(query), subjectKey: query.subject, open: openFilter(query.open), since: dateOf(query.since) };

  if (filter.repo === null && query.repo !== undefined) return badRequest(toolkit, "withoutRepo and repo cannot be asked for together");

  if (!hasFilter(filter)) return badRequest(toolkit, "at least one filter is required: line, repo, withoutRepo, subject, open, or since");

  try {
    return await deps.runs.list(filter, { limit: limitOf(query.limit), cursor: query.cursor });
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;

    return badRequest(toolkit, error.message);
  }
}

async function getOne(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const run = await deps.runs.get(request.params.id as string);

  if (!run) return notFound(toolkit, `no run "${request.params.id}"`);
  const [bag, currentNode, cost] = await Promise.all([deps.runs.bagOf(run), deps.runs.currentNode(run.id), deps.costs.ofRun(run.id)]);

  return { run, bag, currentNode, cost };
}

async function cancel(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const parsed = parseBody(cancelSchema, request.payload);

  if (!parsed.success) return badRequest(toolkit, "invalid cancel request", parsed.errors);

  try {
    return await deps.runs.cancel(request.params.id as string, parsed.value.reason);
  } catch (error) {
    return badRequest(toolkit, error instanceof Error ? error.message : "could not cancel the run");
  }
}

function hasFilter(filter: RunFilter): boolean {
  const given = [filter.lineId, filter.repo, filter.subjectKey, filter.open, filter.since];

  return given.some((value) => value !== undefined);
}

function repoOf(query: Record<string, string | undefined>): string | null | undefined {
  return query.withoutRepo === "true" ? null : query.repo;
}

function openFilter(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;

  return value === "true";
}

function limitOf(value: string | undefined): number {
  const parsed = value ? Number(value) : DEFAULT_LIMIT;

  return Number.isFinite(parsed) ? Math.min(parsed, MAX_LIMIT) : DEFAULT_LIMIT;
}
