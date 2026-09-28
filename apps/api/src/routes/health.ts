// Health and version (docs/api_sketch.md, "Health and version"): unauthenticated, for a load balancer or a human.
import type { Server } from "@hapi/hapi";
import Boom from "@hapi/boom";
import type { PgPool } from "@floor/store";

const SCHEMA_VERSION = 1;

export function registerHealthRoutes(server: Server, pool: PgPool): void {
  server.route({
    method: "GET",
    path: "/healthz",
    options: { auth: false },
    handler: () => ({ status: "up" }),
  });

  server.route({
    method: "GET",
    path: "/readyz",
    options: { auth: false },
    handler: async () => {
      if (!(await canReachDatabase(pool))) throw Boom.serverUnavailable("database unreachable");

      return { status: "ready" };
    },
  });

  server.route({
    method: "GET",
    path: "/version",
    options: { auth: false },
    handler: () => ({ sha: process.env.FLOOR_BUILD_SHA ?? "dev", schemaVersion: SCHEMA_VERSION }),
  });
}

async function canReachDatabase(pool: PgPool): Promise<boolean> {
  try {
    await pool.query("select 1");

    return true;
  } catch {
    return false;
  }
}
