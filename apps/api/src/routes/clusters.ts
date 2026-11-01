// The clusters a floor drives (docs/entities/agent-definition.md, "Distribution and presence"): a cluster-agent registers on start and every minute after, and a reader asks which clusters hold an agent definition's latest version.
import type { Request, ResponseToolkit, Server } from "@hapi/hapi";
import { mergeAgentSettings, type AgentDefinitionBody } from "@floor/store";
import { dispatchSettings, modelSecretKeyOf } from "../agent-config.js";
import type { Deps } from "../deps.js";
import { HTTP_NO_CONTENT } from "../http-status.js";
import { parseBody } from "../parse.js";
import { badRequest, notFound } from "../problem.js";
import { registerClusterSchema } from "../schemas.js";

export function registerClusterRoutes(server: Server, deps: Deps): void {
  server.route({ method: "PUT", path: "/clusters/{id}", handler: (request, toolkit) => register(deps, request, toolkit) });
  server.route({ method: "GET", path: "/agent-definitions/presence", handler: () => deps.clusters.presence() });
  server.route({ method: "GET", path: "/agent-definitions/{id}/clusters", handler: (request) => holdings(deps, request) });
  server.route({ method: "GET", path: "/agent-definitions/{id}/recipes", handler: (request, toolkit) => recipes(deps, request, toolkit) });
}

async function register(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const parsed = parseBody(registerClusterSchema, request.payload);

  if (!parsed.success) return badRequest(toolkit, "invalid cluster", parsed.errors);
  await deps.clusters.register(request.params.id as string, parsed.value.tags);

  return toolkit.response().code(HTTP_NO_CONTENT);
}

async function holdings(deps: Deps, request: Request) {
  return { items: await deps.clusters.holdings(request.params.id as string) };
}

// The settings every visit of the latest version would be briefed with: the base, then each repository's variant merged over it, through the brief's own converter so a pushed recipe is the one a visit names.
async function recipes(deps: Deps, request: Request, toolkit: ResponseToolkit) {
  const id = request.params.id as string;
  const latest = await deps.definitions.latest<AgentDefinitionBody>("agent_definition", id);

  if (!latest) return notFound(toolkit, `no agent_definition "${id}"`);
  const { settings, variants } = latest.body;
  const resolved = [
    { variant: null, merged: settings },
    ...Object.entries(variants ?? {}).map(([repo, variant]) => ({ variant: repo, merged: mergeAgentSettings(settings, variant) })),
  ];

  return {
    id,
    hash: latest.hash,
    body: latest.body,
    floorBaseUrl: deps.config.baseUrl,
    recipes: resolved.map(({ variant, merged }) => ({ variant, settings: dispatchSettings(merged), modelSecretKey: modelSecretKeyOf(merged) })),
  };
}
