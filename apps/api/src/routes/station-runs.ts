// Station runs (docs/api_sketch.md, "Station runs"): read-only; a report arrives as an event, not a write here.
import type { Server } from "@hapi/hapi";
import type { Deps } from "../deps.js";
import { badRequest, notFound } from "../problem.js";

export function registerStationRunRoutes(server: Server, deps: Deps): void {
  server.route({
    method: "GET",
    path: "/station-runs",
    handler: async (request, toolkit) => {
      const query = request.query as Record<string, string | undefined>;

      if (!query.run) return badRequest(toolkit, "filter required: run");
      const visits = await deps.runs.visits(query.run);

      return { items: visits.filter((visit) => matches(visit, query)) };
    },
  });

  server.route({
    method: "GET",
    path: "/station-runs/{id}",
    handler: async (request, toolkit) => {
      const visit = await deps.runs.visit(request.params.id as string);

      return visit ?? notFound(toolkit, `no station run "${request.params.id}"`);
    },
  });
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
