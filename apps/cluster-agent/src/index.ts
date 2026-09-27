// Process entry: a tiny liveness server plus the claim loop. Deliberately
// does not probe the Kubernetes API for readiness — an apiserver blip
// should not take the agent out of rotation, the same reasoning as lore's
// `@re-cinq/lore-cluster-agent` healthz (transport/routes/health.ts),
// reimplemented here on plain `node:http` rather than pulling in a web
// framework for one route.

import { createServer } from "node:http";
import { FloorClient } from "./floor-client.js";
import { KubeAgentResourcesApi } from "./kube/agent-resources.js";
import { KubeSecretKeyWriter } from "./kube/secret-writer.js";
import { runClaimLoop } from "./claim-loop.js";

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;

  if (value === undefined) {
    throw new Error(`missing required environment variable ${name}`);
  }

  return value;
}

function startHealthServer(port: number): void {
  const startedAt = Date.now();

  createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000) }));
  }).listen(port);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  startHealthServer(Number(process.env.FLOOR_HEALTH_PORT ?? "8080"));

  const floor = new FloorClient({
    baseUrl: env("FLOOR_API_URL"),
    token: env("FLOOR_CLUSTER_AGENT_TOKEN"),
  });
  const tags = (process.env.FLOOR_CLUSTER_AGENT_TAGS ?? "kind:agent")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  await runClaimLoop({
    floor,
    resources: new KubeAgentResourcesApi(),
    secrets: new KubeSecretKeyWriter(),
    tags,
    secretName: process.env.FLOOR_AGENT_SECRETS_NAME,
    sleep,
  });
}

main().catch((err) => {
  console.error("[cluster-agent] fatal:", err);
  process.exit(1);
});
