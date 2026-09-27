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
  it("reports deleted:true when the apiserver accepts every removal", async () => {
    const result = await new KubeAgentResourcesApi(() => fakeApi(), "floor-agents").delete("floor-v1");

    expect(result).toEqual({ name: "floor-v1", deleted: true });
  });

  it("deletes all three resources", async () => {
    const calls: string[] = [];
    const api = fakeApi({
      deleteNamespacedCustomObject: vi.fn((args: { plural: string }) => {
        calls.push(args.plural);

        return Promise.resolve({});
      }) as CustomObjectsApi["deleteNamespacedCustomObject"],
    });

    await new KubeAgentResourcesApi(() => api, "floor-agents").delete("floor-v1");

    expect(calls.sort()).toEqual(["agentdefinitions", "agents", "stations"]);
  });

  it("reports deleted:false when nothing was there to delete (a redelivered abort)", async () => {
    const api = fakeApi({
      deleteNamespacedCustomObject: vi.fn(() =>
        Promise.reject({ code: 404 }),
      ) as CustomObjectsApi["deleteNamespacedCustomObject"],
    });

    const result = await new KubeAgentResourcesApi(() => api, "floor-agents").delete("floor-v1");

    expect(result).toEqual({ name: "floor-v1", deleted: false });
  });

  it("reports deleted:true when only one of the three was still present", async () => {
    const api = fakeApi({
      deleteNamespacedCustomObject: vi
        .fn()
        .mockRejectedValueOnce({ code: 404 })
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce({ code: 404 }) as CustomObjectsApi["deleteNamespacedCustomObject"],
    });

    const result = await new KubeAgentResourcesApi(() => api, "floor-agents").delete("floor-v1");

    expect(result).toEqual({ name: "floor-v1", deleted: true });
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
