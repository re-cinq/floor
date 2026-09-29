// Assembly lines, stations and agent definitions (docs/api_sketch.md): the same shape of CRUD three times over, one call per kind.
import type { Request, ResponseToolkit, Server } from "@hapi/hapi";
import { z, type ZodType } from "zod";
import type { DefinitionKind, LineBody, StationBody } from "@floor/store";
import { validateLine } from "@floor/store";
import type { Deps } from "../deps.js";
import { HTTP_CREATED, HTTP_NO_CONTENT } from "../http-status.js";
import { parseBody } from "../parse.js";
import { badRequest, conflict, notFound } from "../problem.js";
import { agentDefinitionBodySchema, lineBodySchema, stationBodySchema } from "../schemas.js";
import { registerStartRoute } from "./start.js";

interface KindRoutes<Body> {
  base: string;
  kind: DefinitionKind;
  bodySchema: ZodType<Body>;
  guardArchive?: (deps: Deps, id: string) => Promise<string | null>;
  semanticValidate?: (deps: Deps, body: Body) => Promise<string[]>;
}

export function registerDefinitionRoutes(server: Server, deps: Deps): void {
  registerKindRoutes(server, deps, {
    base: "assembly-lines",
    kind: "line",
    bodySchema: lineBodySchema,
    guardArchive: guardOpenRuns,
    semanticValidate: validateLineBody,
  });
  registerKindRoutes(server, deps, { base: "stations", kind: "station", bodySchema: stationBodySchema });
  registerKindRoutes(server, deps, { base: "agent-definitions", kind: "agent_definition", bodySchema: agentDefinitionBodySchema, guardArchive: guardStationsNaming });
  registerStartRoute(server, deps);
}

function registerKindRoutes<Body>(server: Server, deps: Deps, routes: KindRoutes<Body>): void {
  const { base, kind, bodySchema } = routes;
  const idSchema = z.intersection(z.object({ id: z.string() }), bodySchema);

  server.route({ method: "GET", path: `/${base}`, handler: (request) => listLatest(deps, kind, request) });
  server.route({ method: "GET", path: `/${base}/{id}`, handler: (request, toolkit) => getLatest(deps, kind, request, toolkit) });
  server.route({ method: "GET", path: `/${base}/{id}/versions`, handler: (request) => listVersions(deps, kind, request) });
  server.route({ method: "GET", path: `/${base}/{id}/versions/{hash}`, handler: (request, toolkit) => getVersion(deps, kind, request, toolkit) });
  server.route({ method: "POST", path: `/${base}`, handler: createHandler(deps, routes, idSchema) });
  server.route({ method: "PUT", path: `/${base}/{id}`, handler: putVersionHandler(deps, routes) });
  server.route({ method: "DELETE", path: `/${base}/{id}`, handler: archiveHandler(deps, kind, routes.guardArchive) });
}

async function validateLineBody(deps: Deps, body: LineBody): Promise<string[]> {
  const stations = await deps.definitions.listLatest<StationBody>("station");

  return validateLine(body, { stations: new Set(stations.map((row) => row.id)) });
}

async function listLatest(deps: Deps, kind: DefinitionKind, request: Request) {
  const name = typeof request.query.name === "string" ? request.query.name : undefined;

  return { items: await deps.definitions.listLatest(kind, name) };
}

async function getLatest(deps: Deps, kind: DefinitionKind, request: Request, toolkit: ResponseToolkit) {
  const row = await deps.definitions.latest(kind, request.params.id as string);

  return row ?? notFound(toolkit, `no ${kind} "${request.params.id}"`);
}

async function listVersions(deps: Deps, kind: DefinitionKind, request: Request) {
  return { items: await deps.definitions.versions(kind, request.params.id as string) };
}

async function getVersion(deps: Deps, kind: DefinitionKind, request: Request, toolkit: ResponseToolkit) {
  const row = await deps.definitions.byHash(kind, request.params.id as string, request.params.hash as string);

  return row ?? notFound(toolkit, `no ${kind} "${request.params.id}" at "${request.params.hash}"`);
}

function createHandler<Body>(deps: Deps, routes: KindRoutes<Body>, idSchema: ZodType<{ id: string } & Body>) {
  const { kind } = routes;

  return async (request: Request, toolkit: ResponseToolkit) => {
    const parsed = parseBody(idSchema, request.payload);

    if (!parsed.success) return badRequest(toolkit, `invalid ${kind} body`, parsed.errors);
    const { id, ...body } = parsed.value;
    const problems = await routes.semanticValidate?.(deps, body as Body);

    if (problems && problems.length > 0) return badRequest(toolkit, `invalid ${kind} body`, problems);

    return toolkit.response(await deps.definitions.put(kind, id, body)).code(HTTP_CREATED);
  };
}

function putVersionHandler<Body>(deps: Deps, routes: KindRoutes<Body>) {
  const { kind, bodySchema } = routes;

  return async (request: Request, toolkit: ResponseToolkit) => {
    const parsed = parseBody(bodySchema, request.payload);

    if (!parsed.success) return badRequest(toolkit, `invalid ${kind} body`, parsed.errors);
    const problems = await routes.semanticValidate?.(deps, parsed.value);

    if (problems && problems.length > 0) return badRequest(toolkit, `invalid ${kind} body`, problems);

    return deps.definitions.put(kind, request.params.id as string, parsed.value);
  };
}

function archiveHandler(deps: Deps, kind: DefinitionKind, guardArchive: KindRoutes<unknown>["guardArchive"]) {
  return async (request: Request, toolkit: ResponseToolkit) => {
    const id = request.params.id as string;
    const blocker = await guardArchive?.(deps, id);

    if (blocker) return conflict(toolkit, blocker);
    await deps.definitions.archive(kind, id);

    return toolkit.response().code(HTTP_NO_CONTENT);
  };
}

async function guardOpenRuns(deps: Deps, lineId: string): Promise<string | null> {
  const { rowCount } = await deps.pool.query(`select 1 from assembly_runs where line_id = $1 and finished_at is null limit 1`, [lineId]);

  return rowCount ? `line "${lineId}" has open runs` : null;
}

async function guardStationsNaming(deps: Deps, agentDefinitionId: string): Promise<string | null> {
  const stations = await deps.definitions.listLatest<StationBody>("station");
  const holder = stations.find((station) => station.body.agentDefinition === agentDefinitionId);

  return holder ? `agent definition "${agentDefinitionId}" is named by station "${holder.id}"` : null;
}
