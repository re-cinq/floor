// Assembly runs (docs/api_sketch.md, "Assembly runs"): read-only plus cancel; a run is otherwise only created by start.
import type { Request, ResponseToolkit, Server } from "@hapi/hapi";
import { z } from "zod";
import type { RunFilter } from "@floor/store";
import type { Deps } from "../deps.js";
import { parseBody } from "../parse.js";
import { badRequest, notFound } from "../problem.js";

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
  const filter: RunFilter = { lineId: query.line, repo: query.repo, subjectKey: query.subject, open: openFilter(query.open) };

  if (!hasFilter(filter)) return badRequest(toolkit, "at least one filter is required: line, repo, subject, or open");

  return deps.runs.list(filter, { limit: limitOf(query.limit), cursor: query.cursor });
}

async function getOne(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const run = await deps.runs.get(request.params.id as string);

  if (!run) return notFound(toolkit, `no run "${request.params.id}"`);
  const bag = await deps.runs.bag(run.id);

  return { run, bag };
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
  const given = [filter.lineId, filter.repo, filter.subjectKey, filter.open];

  return given.some((value) => value !== undefined);
}

function openFilter(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;

  return value === "true";
}

function limitOf(value: string | undefined): number {
  const parsed = value ? Number(value) : DEFAULT_LIMIT;

  return Number.isFinite(parsed) ? Math.min(parsed, MAX_LIMIT) : DEFAULT_LIMIT;
}
