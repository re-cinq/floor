// Process entry: a tiny liveness server plus the claim loop; no Kubernetes readiness probe, an apiserver blip should not take the agent out of rotation.

import { createServer, type Server } from "node:http";
import { FloorClient } from "./floor-client.js";
import { KubeAgentResourcesApi } from "./kube/agent-resources.js";
import { KubeSecretKeyWriter } from "./kube/secret-writer.js";
import { runClaimLoop } from "./claim-loop.js";
import { parseKeyByFamily } from "./domain/model-secret.js";
import { createStoppable } from "./lib/stoppable.js";

const HTTP_OK = 200;
const MS_PER_SECOND = 1000;

async function main(): Promise<void> {
  const floor = new FloorClient({
    baseUrl: env("FLOOR_API_URL"),
    token: env("FLOOR_CLUSTER_AGENT_TOKEN"),
  });
  const { running, sleep, stop } = createStoppable();

  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  const healthServer = startHealthServer(Number(process.env.FLOOR_HEALTH_PORT ?? "8080"));

  await runClaimLoop({
    floor,
    resources: new KubeAgentResourcesApi(),
    secrets: new KubeSecretKeyWriter(),
    tags: claimTags(),
    secretName: process.env.FLOOR_AGENT_SECRETS_NAME,
    modelSecretKeys: parseKeyByFamily(process.env.FLOOR_MODEL_SECRET_KEYS),
    idleMs: millisecondsOf(process.env.FLOOR_CLAIM_IDLE_MS),
    maxIdleMs: millisecondsOf(process.env.FLOOR_CLAIM_MAX_IDLE_MS),
    running,
    sleep,
    onError: (error) => {
      console.error("[cluster-agent] the floor could not be reached; trying again:", error instanceof Error ? error.message : error);
    },
  });

  healthServer.close();
  // A probe may hold its connection open, and close() alone waits for it.
  healthServer.closeAllConnections();
  console.log("[cluster-agent] stopped");
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
