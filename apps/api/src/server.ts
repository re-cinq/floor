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
import { registerGitCredentialRoutes } from "./routes/git-credential.js";
import { registerConversationRoutes } from "./routes/conversations.js";
import { registerSkillRoutes } from "./routes/skills.js";
import { registerCostsRoutes } from "./routes/costs.js";
import { registerScheduleRoutes } from "./routes/schedules.js";

const ROUTES = [
  registerDefinitionRoutes,
  registerRunRoutes,
  registerStationRunRoutes,
  registerBlobRoutes,
  registerEventRoutes,
  registerSinkRoutes,
  registerGitCredentialRoutes,
  registerConversationRoutes,
  registerCostsRoutes,
  registerScheduleRoutes,
];

export async function buildServer(deps: Deps, holdsLease: () => boolean): Promise<Hapi.Server> {
  const server = Hapi.server({ port: deps.config.port, host: "0.0.0.0" });

  registerAuth(server, { serviceToken: deps.config.serviceToken, visitTokenSecret: deps.config.visitTokenSecret, now: deps.now });
  registerHealthRoutes(server, { pool: deps.pool, holdsLease });
  registerSkillRoutes(server);
  for (const register of ROUTES) register(server, deps);

  await server.initialize();

  return server;
}
