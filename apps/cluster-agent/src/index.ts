// Process entry: a tiny liveness server plus the claim loop; no Kubernetes readiness probe, an apiserver blip should not take the agent out of rotation.

import { createServer, type Server } from "node:http";
import { createFloorClient, serviceToken } from "@re-cinq/floor-client";
import { KubeAgentResourcesApi } from "./kube/agent-resources.js";
import { KubeSecretKeyWriter } from "./kube/secret-writer.js";
import { reportHolding, runClaimLoop } from "./claim-loop.js";
import { watchRecipes } from "./kube/recipe-watch.js";
import { subsystemReader } from "./kube/subsystem-versions.js";
import { agentsNamespace } from "./kube/clients.js";
import { parseKeyByFamily } from "./domain/model-secret.js";
import { createStoppable } from "./lib/stoppable.js";

const HTTP_OK = 200;
const MS_PER_SECOND = 1000;

async function main(): Promise<void> {
  const floor = createFloorClient({
    url: env("FLOOR_API_URL"),
    token: serviceToken(env("FLOOR_CLUSTER_AGENT_TOKEN")),
  });
  const { running, sleep, stop } = createStoppable();

  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  const healthServer = startHealthServer(Number(process.env.FLOOR_HEALTH_PORT ?? "8080"));
  const clusterId = env("FLOOR_CLUSTER_ID");
  const resources = new KubeAgentResourcesApi();

  watchRecipes({ report: (definitionId) => reportHolding({ floor, clusterId, resources }, definitionId), onError: onWatchError, running });
  await runClaimLoop({
    floor,
    clusterId,
    resources,
    secrets: new KubeSecretKeyWriter(),
    tags: [...claimTags(), `cluster:${clusterId}`],
    ...clusterSettings(),
    idleMs: millisecondsOf(process.env.FLOOR_CLAIM_IDLE_MS),
    maxIdleMs: millisecondsOf(process.env.FLOOR_CLAIM_MAX_IDLE_MS),
    running,
    sleep,
    onError,
  });

  healthServer.close();
  // A probe may hold its connection open, and close() alone waits for it.
  healthServer.closeAllConnections();
  console.log("[cluster-agent] stopped");
}

// What this cluster holds and runs, from its environment: the secret its model keys live in, and the build and subsystem it registers with.
function clusterSettings() {
  return {
    secretName: process.env.FLOOR_AGENT_SECRETS_NAME,
    modelSecretKeys: parseKeyByFamily(process.env.FLOOR_MODEL_SECRET_KEYS),
    build: process.env.FLOOR_BUILD_SHA,
    readSubsystem: subsystemReader(process.env.FLOOR_SUBSYSTEM_NAMESPACE || agentsNamespace()),
  };
}

function onError(error: unknown): void {
  console.error("[cluster-agent] the floor could not be reached; trying again:", error instanceof Error ? error.message : error);
}

function onWatchError(error: unknown): void {
  console.error("[cluster-agent] the recipe watch dropped; reopening:", error instanceof Error ? error.message : error);
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;

  if (value === undefined) {
    throw new Error(`missing required environment variable ${name}`);
  }

  return value;
}

function claimTags(): string[] {
  return (process.env.FLOOR_CLUSTER_AGENT_TAGS ?? "kind:agent")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function millisecondsOf(given: string | undefined): number | undefined {
  const parsed = Number(given);

  return given && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function startHealthServer(port: number): Server {
  const startedAt = Date.now();

  return createServer((req, res) => {
    res.writeHead(HTTP_OK, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptimeSeconds: Math.floor((Date.now() - startedAt) / MS_PER_SECOND) }));
  }).listen(port);
}

main().catch((err) => {
  console.error("[cluster-agent] fatal:", err);
  process.exit(1);
});
