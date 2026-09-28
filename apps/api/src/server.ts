import Hapi from "@hapi/hapi";
import { registerAuth } from "./auth.js";
import type { Deps } from "./deps.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerDefinitionRoutes } from "./routes/definitions.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerStationRunRoutes } from "./routes/station-runs.js";
import { registerBlobRoutes } from "./routes/blobs.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerSinkRoutes } from "./routes/sink.js";
import { registerConversationRoutes } from "./routes/conversations.js";
import { registerSkillRoutes } from "./routes/skills.js";
import { registerCostsRoutes } from "./routes/costs.js";

export async function buildServer(deps: Deps, holdsLease: () => boolean): Promise<Hapi.Server> {
  const server = Hapi.server({ port: deps.config.port, host: "0.0.0.0" });

  registerAuth(server, { serviceToken: deps.config.serviceToken, visitTokenSecret: deps.config.visitTokenSecret, now: deps.now });
  registerHealthRoutes(server, { pool: deps.pool, holdsLease });
  registerDefinitionRoutes(server, deps);
  registerRunRoutes(server, deps);
  registerStationRunRoutes(server, deps);
  registerBlobRoutes(server, deps);
  registerEventRoutes(server, deps);
  registerSinkRoutes(server, deps);
  registerConversationRoutes(server, deps);
  registerSkillRoutes(server);
  registerCostsRoutes(server, deps);

  await server.initialize();

  return server;
}
