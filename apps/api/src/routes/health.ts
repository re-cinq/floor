// Health and version (docs/api_sketch.md, "Health and version"): unauthenticated, for a load balancer or a human; the version names this build, its schema and what each live cluster runs. Every instance that can reach its database serves; which one runs the loop is a fact about it, not a condition of serving.
import type { Server } from "@hapi/hapi";
import Boom from "@hapi/boom";
import { schemaVersion, type ClusterStore, type DatabaseProbe } from "@floor/store";

export interface Readiness {
  databaseProbe: DatabaseProbe;
  holdsLease: () => boolean;
  clusters: Pick<ClusterStore, "liveVersions">;
}

export function registerHealthRoutes(server: Server, readiness: Readiness): void {
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
      if (!(await readiness.databaseProbe.reachable())) throw Boom.serverUnavailable("database unreachable");

      return { status: "ready" };
    },
  });

  server.route({
    method: "GET",
    path: "/version",
    options: { auth: false },
    handler: async () => ({
      sha: process.env.FLOOR_BUILD_SHA ?? "dev",
      schemaVersion: await schemaVersion(),
      runsLoop: readiness.holdsLease(),
      clusters: await readiness.clusters.liveVersions(),
    }),
  });
}
