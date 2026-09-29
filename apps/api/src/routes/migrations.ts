// Migrations (docs/api_sketch.md, "Migrations"): the pipeline files that ran. A file is remembered by its name and by the sha256 of what it held, so one that ran is never run again, and one changed since is told apart from the one that ran. A service's alone, as every route is that does not say otherwise.
import type { Request, ResponseToolkit, Server } from "@hapi/hapi";
import { z } from "zod";
import type { Deps } from "../deps.js";
import { HTTP_CREATED } from "../http-status.js";
import { parseBody } from "../parse.js";
import { badRequest, conflict, notFound } from "../problem.js";

const migrationBodySchema = z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/) });

type MigrationBody = z.infer<typeof migrationBodySchema>;

export function registerMigrationRoutes(server: Server, deps: Deps): void {
  server.route({ method: "GET", path: "/migrations", handler: () => listed(deps) });
  server.route({ method: "GET", path: "/migrations/{name}", handler: (request, toolkit) => remembered(deps, request, toolkit) });
  server.route({ method: "PUT", path: "/migrations/{name}", handler: (request, toolkit) => ran(deps, request, toolkit) });
}

async function listed(deps: Deps) {
  return { items: await deps.definitions.listLatest<MigrationBody>("migration") };
}

async function remembered(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const name = request.params.name as string;
  const row = await deps.definitions.latest<MigrationBody>("migration", name);

  return row ?? notFound(toolkit, `no migration "${name}" has run`);
}

// A migration runs once. Told of the same file again, the floor answers as it did; told of another under the same name, it refuses: what ran is what ran.
async function ran(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const name = request.params.name as string;
  const parsed = parseBody(migrationBodySchema, request.payload);

  if (!parsed.success) return badRequest(toolkit, "invalid migration body", parsed.errors);
  const before = await deps.definitions.latest<MigrationBody>("migration", name);

  if (before && before.body.sha256 !== parsed.value.sha256) return conflict(toolkit, `migration "${name}" ran as ${before.body.sha256}, and is never run as another`);

  return toolkit.response(await deps.definitions.put("migration", name, parsed.value)).code(HTTP_CREATED);
}
