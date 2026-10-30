import type { DispatchBrief } from "./agent-triple.js";

export function brief(overrides: Partial<DispatchBrief> = {}): DispatchBrief {
  return {
    visitId: "abc-123",
    runId: "run-1",
    lineId: "line-1",
    nodeId: "node-1",
    floorBaseUrl: "http://host.minikube.internal:8080",
    tokenSecretKey: "visit-abc-123-token",
    visitToken: "visit-token-abc",
    secretName: "agent-secrets",
    deadlineMinutes: 20,
    settings: {
      model: "claude-sonnet-4-6",
      prompt: "Review the diff on {pr_url}.",
      image: "ghcr.io/re-cinq/floor-station:1.0",
    },
    needs: [],
    produces: [],
    conversation: { mode: "new", save: false },
    ...overrides,
  };
}
