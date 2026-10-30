import { describe, expect, it, vi } from "vitest";
import type { CustomObjectsApi } from "@kubernetes/client-node";
import { KubeAgentResourcesApi } from "./agent-resources.js";
import type { AgentTriple } from "../domain/agent-triple.js";

const triple: AgentTriple = {
  station: { metadata: { name: "floor-v1" }, spec: { agentDefRef: "floor-v1", template: {} } },
  agentDefinition: { metadata: { name: "floor-v1" }, spec: { prompt: "hi" } },
  agent: { metadata: { name: "floor-v1" }, spec: { stationRef: "floor-v1" } },
} as unknown as AgentTriple;

function fakeApi(overrides: Partial<CustomObjectsApi> = {}): CustomObjectsApi {
  return {
    createNamespacedCustomObject: vi.fn(() => Promise.resolve({})),
    deleteNamespacedCustomObject: vi.fn(() => Promise.resolve({})),
    ...overrides,
  } as unknown as CustomObjectsApi;
}

describe("KubeAgentResourcesApi.apply", () => {
  it("creates the Station, then the AgentDefinition, then the Agent, in that order", async () => {
    const calls: string[] = [];
    const api = fakeApi({
      createNamespacedCustomObject: vi.fn((args: { plural: string }) => {
        calls.push(args.plural);

        return Promise.resolve({});
      }) as CustomObjectsApi["createNamespacedCustomObject"],
    });

    await new KubeAgentResourcesApi(() => api, "floor-agents").apply(triple);

    expect(calls).toEqual(["stations", "agentdefinitions", "agents"]);
  });

  it("reports created:true when the apiserver accepts every resource", async () => {
    const result = await new KubeAgentResourcesApi(() => fakeApi(), "floor-agents").apply(triple);

    expect(result).toEqual({ name: "floor-v1", created: true });
  });

  it("reports created:false for a 409 on the Agent, so a redelivered dispatch is idempotent", async () => {
    const api = fakeApi({
      createNamespacedCustomObject: vi
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce({ code: 409 }) as CustomObjectsApi["createNamespacedCustomObject"],
    });

    const result = await new KubeAgentResourcesApi(() => api, "floor-agents").apply(triple);

    expect(result).toEqual({ name: "floor-v1", created: false });
  });

  it("rethrows a 403, which means the Role is missing rather than the CR present", async () => {
    const api = fakeApi({
      createNamespacedCustomObject: vi
        .fn()
        .mockRejectedValueOnce({ code: 403 }) as CustomObjectsApi["createNamespacedCustomObject"],
    });

    await expect(
      new KubeAgentResourcesApi(() => api, "floor-agents").apply(triple),
    ).rejects.toMatchObject({ code: 403 });
  });
});

describe("KubeAgentResourcesApi.delete", () => {
  it("reports deleted:true when the apiserver removes the Agent", async () => {
    const result = await new KubeAgentResourcesApi(() => fakeApi(), "floor-agents").delete("floor-v1");

    expect(result).toEqual({ name: "floor-v1", deleted: true });
  });

  it("deletes the visit's Agent only, leaving its recipe to the other visits that run it", async () => {
    const calls: string[] = [];
    const api = fakeApi({
      deleteNamespacedCustomObject: vi.fn((args: { plural: string; name: string }) => {
        calls.push(`${args.plural}/${args.name}`);

        return Promise.resolve({});
      }) as CustomObjectsApi["deleteNamespacedCustomObject"],
    });

    await new KubeAgentResourcesApi(() => api, "floor-agents").delete("floor-v1");

    expect(calls).toEqual(["agents/floor-v1"]);
  });

  it("reports deleted:false when the Agent was already gone (a redelivered abort)", async () => {
    const api = fakeApi({
      deleteNamespacedCustomObject: vi.fn(() =>
        Promise.reject({ code: 404 }),
      ) as CustomObjectsApi["deleteNamespacedCustomObject"],
    });

    const result = await new KubeAgentResourcesApi(() => api, "floor-agents").delete("floor-v1");

    expect(result).toEqual({ name: "floor-v1", deleted: false });
  });

  it("rethrows a non-404 failure", async () => {
    const api = fakeApi({
      deleteNamespacedCustomObject: vi.fn(() =>
        Promise.reject({ code: 500 }),
      ) as CustomObjectsApi["deleteNamespacedCustomObject"],
    });

    await expect(
      new KubeAgentResourcesApi(() => api, "floor-agents").delete("floor-v1"),
    ).rejects.toMatchObject({ code: 500 });
  });
});

describe("KubeAgentResourcesApi.sweep", () => {
  const listed: Record<string, unknown[]> = {
    agents: [{ metadata: { name: "floor-v2" }, spec: { stationRef: "floor-aaaaaaaaaaaa" } }],
    stations: [
      { metadata: { name: "floor-aaaaaaaaaaaa", creationTimestamp: "2026-10-30T10:00:00Z", labels: { "floor.re-cinq.com/recipe": "true" } }, spec: { agentDefRef: "floor-aaaaaaaaaaaa" } },
      { metadata: { name: "floor-bbbbbbbbbbbb", creationTimestamp: "2026-10-30T10:00:00Z", labels: { "floor.re-cinq.com/recipe": "true" } }, spec: { agentDefRef: "floor-bbbbbbbbbbbb" } },
    ],
    agentdefinitions: [
      { metadata: { name: "floor-aaaaaaaaaaaa", creationTimestamp: "2026-10-30T10:00:00Z", labels: { "floor.re-cinq.com/recipe": "true" } } },
      { metadata: { name: "floor-bbbbbbbbbbbb", creationTimestamp: "2026-10-30T10:00:00Z", labels: { "floor.re-cinq.com/recipe": "true" } } },
    ],
  };

  it("deletes the Station and AgentDefinition floor-bbbbbbbbbbbb no Agent runs, and keeps floor-aaaaaaaaaaaa", async () => {
    const deleted: string[] = [];
    const api = fakeApi({
      listNamespacedCustomObject: vi.fn((args: { plural: string }) => Promise.resolve({ items: listed[args.plural] })) as CustomObjectsApi["listNamespacedCustomObject"],
      deleteNamespacedCustomObject: vi.fn((args: { plural: string; name: string }) => {
        deleted.push(`${args.plural}/${args.name}`);

        return Promise.resolve({});
      }) as CustomObjectsApi["deleteNamespacedCustomObject"],
    });

    const removed = await new KubeAgentResourcesApi(() => api, "floor-agents").sweep(new Date("2026-10-30T12:00:00Z"));

    expect({ removed, deleted: deleted.sort() }).toEqual({
      removed: { stations: ["floor-bbbbbbbbbbbb"], definitions: ["floor-bbbbbbbbbbbb"] },
      deleted: ["agentdefinitions/floor-bbbbbbbbbbbb", "stations/floor-bbbbbbbbbbbb"],
    });
  });
});
