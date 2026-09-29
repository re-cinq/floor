// Cost rollups (docs/api_sketch.md, "Costs"): a service-token-only read over CostsStore.summary.
import type { Request, ResponseToolkit, Server } from "@hapi/hapi";
import type { CostsFilter, CostsGroupBy } from "@floor/store";
import type { Credentials } from "../auth.js";
import type { Deps } from "../deps.js";
import { badRequest, forbidden } from "../problem.js";
import { isUuid } from "./own-visit.js";

const GROUP_BY_VALUES: CostsGroupBy[] = ["day", "line", "station", "model", "run"];

export function registerCostsRoutes(server: Server, deps: Deps): void {
  server.route({ method: "GET", path: "/costs", handler: (request, toolkit) => summary(deps, request, toolkit) });
}

async function summary(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const credentials = request.auth.credentials as Credentials;

  if (credentials.kind !== "service") return forbidden(toolkit, "only a service token may read costs");
  const query = request.query as Record<string, string | undefined>;
  const filter = filterFrom(query);

  if (query.run && !isUuid(query.run)) return badRequest(toolkit, `"${query.run}" is no run's id`);
  if (!hasFilter(filter)) return badRequest(toolkit, "at least one filter is required: run, repo, line, station, since, or until");
  const groupBy = groupByOf(query.group);

  if (!groupBy) return badRequest(toolkit, "group is required: day, line, station, model, or run");

  return { items: await deps.costs.summary(filter, groupBy) };
}

function filterFrom(query: Record<string, string | undefined>): CostsFilter {
  return { runId: query.run, repo: query.repo, lineId: query.line, station: query.station, since: dateOf(query.since), until: dateOf(query.until) };
}

function hasFilter(filter: CostsFilter): boolean {
  return Object.values(filter).some((value) => value !== undefined);
}

function dateOf(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function groupByOf(value: string | undefined): CostsGroupBy | undefined {
  return GROUP_BY_VALUES.find((candidate) => candidate === value);
}
