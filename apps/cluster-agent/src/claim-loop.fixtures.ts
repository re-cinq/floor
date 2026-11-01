// The fake floor, kube and secret writer every claim-loop test file drives the loop with, and one tick of it.
import { vi } from "vitest";
import { runClaimLoop } from "./claim-loop.js";
import type { AgentResourcesApi } from "./kube/agent-resources.js";
import type { SecretKeyWriter } from "./kube/secret-writer.js";
import type { BriefOutcome, FloorClient } from "@re-cinq/floor-client";
import type { AgentDefinitionBody, AgentRecipes, FloorEventView, VisitBrief } from "@re-cinq/floor-contracts";

export interface FakeCalls {
  claim: (claiming: { tags: string[]; limit: number }) => Promise<FloorEventView[]>;
  ack: (eventId: string) => Promise<void>;
  fail: (eventId: string, error: string) => Promise<void>;
  brief: (visitId: string) => Promise<BriefOutcome>;
  recipes: (id: string) => Promise<AgentRecipes<AgentDefinitionBody> | null>;
  post: (event: { name: string; payload: Record<string, unknown> }) => Promise<FloorEventView>;
  register: (id: string, tags: string[]) => Promise<void>;
}

export interface FakeFloor extends FakeCalls {
  client: FloorClient;
}

export function fakeFloor(overrides: Partial<FakeCalls> = {}): FakeFloor {
  const calls: FakeCalls = {
    claim: vi.fn(() => Promise.resolve([] as FloorEventView[])),
    ack: vi.fn(() => Promise.resolve()),
    fail: vi.fn(() => Promise.resolve()),
    brief: vi.fn(() => Promise.resolve({ kind: "absent" } as BriefOutcome)),
    recipes: vi.fn(() => Promise.resolve(null)),
    post: vi.fn(() => Promise.resolve({} as FloorEventView)),
    register: vi.fn(() => Promise.resolve()),
    ...overrides,
  };

  return {
    ...calls,
    client: {
      events: calls,
      stationRuns: { brief: calls.brief },
      agentDefinitions: { recipes: calls.recipes },
      clusters: { register: calls.register },
    } as unknown as FloorClient,
  };
}

export function claiming(events: FloorEventView[]): FakeCalls["claim"] {
  return vi.fn(() => Promise.resolve(events));
}

export function dispatchOf(id: string, visitId: string, name = "station_run.dispatch"): FloorEventView {
  return { id, name, payload: { visitId } } as unknown as FloorEventView;
}

export function fakeResources(overrides: Partial<AgentResourcesApi> = {}): AgentResourcesApi {
  return {
    apply: vi.fn(() => Promise.resolve({ name: "x", created: true })),
    delete: vi.fn(() => Promise.resolve({ name: "x", deleted: true })),
    sweep: vi.fn(() => Promise.resolve({ agents: [], stations: [], definitions: [] })),
    applyRecipe: vi.fn(() => Promise.resolve()),
    heldRecipes: vi.fn(() => Promise.resolve([])),
    ...overrides,
  };
}

export function fakeSecrets(overrides: Partial<SecretKeyWriter> = {}): SecretKeyWriter {
  return {
    setKey: vi.fn(() => Promise.resolve()),
    deleteKey: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

export const dispatchBrief: VisitBrief = {
  visitId: "v1",
  runId: "run-1",
  lineId: "code-review",
  nodeId: "review",
  floorBaseUrl: "http://host.minikube.internal:8080",
  token: "visit-token-abc",
  deadlineMinutes: 20,
  settings: { prompt: "hi", image: "img:1" },
  needs: [],
  produces: [],
  conversation: { mode: "new", save: false },
  iteration: 1,
};

export async function runOneTick(floor: FakeFloor, rest: Omit<Parameters<typeof runClaimLoop>[0], "floor" | "clusterId">): Promise<void> {
  let ticks = 0;

  await runClaimLoop({
    clusterId: "east",
    ...rest,
    floor: floor.client,
    sleep: async () => {
      ticks += 1;
    },
    running: () => ticks === 0,
  });
}
