// Process entry: a tiny liveness server plus the claim loop; no Kubernetes readiness probe, an apiserver blip should not take the agent out of rotation.

import { createServer } from "node:http";
import { FloorClient } from "./floor-client.js";
import { KubeAgentResourcesApi } from "./kube/agent-resources.js";
import { KubeSecretKeyWriter } from "./kube/secret-writer.js";
import { runClaimLoop } from "./claim-loop.js";

const HTTP_OK = 200;
const MS_PER_SECOND = 1000;

async function main(): Promise<void> {
  startHealthServer(Number(process.env.FLOOR_HEALTH_PORT ?? "8080"));

  const floor = new FloorClient({
    baseUrl: env("FLOOR_API_URL"),
    token: env("FLOOR_CLUSTER_AGENT_TOKEN"),
  });
  const tags = (process.env.FLOOR_CLUSTER_AGENT_TAGS ?? "kind:agent")
    .split(",")
    .map((tag) => tag.trim())
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

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;

  if (value === undefined) {
    throw new Error(`missing required environment variable ${name}`);
  }

  return value;
}

function startHealthServer(port: number): void {
  const startedAt = Date.now();

  createServer((req, res) => {
    res.writeHead(HTTP_OK, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptimeSeconds: Math.floor((Date.now() - startedAt) / MS_PER_SECOND) }));
  }).listen(port);
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

main().catch((err) => {
  console.error("[cluster-agent] fatal:", err);
  process.exit(1);
});
