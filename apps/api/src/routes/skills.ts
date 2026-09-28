// The registry an agent pod's init fetches from before the agent starts. The ai-agent-subsystem starts Claude with `--settings` pointing at the file it fetched from here, so with no registry the agent dies at once with "Settings file not found".
import type { Server } from "@hapi/hapi";

/** No hooks, no overrides: the agent runs on its own defaults. Fetched by curl with no credential, so nothing here may ever be a secret. */
const AGENT_SETTINGS = {};

export function registerSkillRoutes(server: Server): void {
  server.route({
    method: "GET",
    path: "/skills/settings.json",
    options: { auth: false },
    handler: () => AGENT_SETTINGS,
  });
}
