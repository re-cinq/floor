import { describe, expect, it, vi } from "vitest";
import type { AgentDefinitionBody, AgentRecipes, FloorEventView } from "@re-cinq/floor-contracts";
import { claiming, fakeFloor, fakeResources, fakeSecrets, runOneTick, type FakeFloor } from "./claim-loop.fixtures.js";
import type { AgentResourcesApi } from "./kube/agent-resources.js";
import type { HeldRecipe } from "./domain/pushed-recipe.js";

const REVIEWER_BODY: AgentDefinitionBody = { settings: { model: "claude-sonnet-4-6", prompt: "Review the change.", image: "agent:1", timeoutMinutes: 30 } };

const REVIEWER_RECIPES: AgentRecipes<AgentDefinitionBody> = {
  id: "reviewer",
  hash: "h2",
  body: REVIEWER_BODY,
  floorBaseUrl: "http://floor",
  recipes: [{ variant: null, settings: REVIEWER_BODY.settings }],
};

interface PushScenario {
  floor: FakeFloor;
  resources: AgentResourcesApi;
}

async function pushScenario(given: { named?: string; recipes?: AgentRecipes<AgentDefinitionBody> | null; heldHash?: string }): Promise<PushScenario> {
  const floor = fakeFloor({
    claim: claiming([changedOf("e7", "reviewer", given.named ?? "h2")]),
    recipes: vi.fn(() => Promise.resolve(given.recipes === undefined ? REVIEWER_RECIPES : given.recipes)),
  });
  const resources = fakeResources({ heldRecipes: vi.fn(() => Promise.resolve([heldAt(given.heldHash ?? "h2")])) });

  await runOneTick(floor, { resources, secrets: fakeSecrets(), tags: ["kind:agent"], sleep: async () => {} });

  return { floor, resources };
}

function changedOf(id: string, definitionId: string, hash: string): FloorEventView {
  return { id, name: "agent_definition.changed", payload: { id: definitionId, hash } } as unknown as FloorEventView;
}

function heldAt(hash: string): HeldRecipe {
  return { hash, variant: null, body: REVIEWER_BODY, createdAt: "2026-11-01T12:00:00Z", spec: REVIEWER_BODY.settings };
}

describe("runClaimLoop: a changed agent definition", () => {
  it("applies the recipe of the latest version h2 the floor answers, though the event named h1", async () => {
    const { resources } = await pushScenario({ named: "h1" });

    expect(resources.applyRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ agentDefinition: expect.objectContaining({ metadata: expect.objectContaining({ annotations: expect.objectContaining({ "floor.re-cinq.com/definition-hash": "h2" }) }) }) }),
    );
  });

  it("reports what kube holds of reviewer as agent_definition.reported from east", async () => {
    const { floor } = await pushScenario({});

    expect(floor.post).toHaveBeenCalledWith({ name: "agent_definition.reported", payload: { clusterId: "east", definitionId: "reviewer", body: REVIEWER_BODY } });
  });

  it("acks e7 once kube reads back h2", async () => {
    const { floor } = await pushScenario({});

    expect(floor.ack).toHaveBeenCalledWith("e7");
  });

  it("fails e7, to be tried again, when kube reads back h1 instead of h2", async () => {
    const { floor } = await pushScenario({ heldHash: "h1" });

    expect(floor.fail).toHaveBeenCalledWith("e7", "kube does not hold agent definition reviewer at h2");
  });

  it("applies nothing for an agent definition the floor no longer has", async () => {
    const { resources } = await pushScenario({ recipes: null });

    expect(resources.applyRecipe).not.toHaveBeenCalled();
  });
});

describe("runClaimLoop: registering", () => {
  it("registers east with the tags it claims by on its first tick", async () => {
    const floor = fakeFloor();

    await runOneTick(floor, { resources: fakeResources(), secrets: fakeSecrets(), tags: ["kind:agent", "cluster:east"], sleep: async () => {} });

    expect(floor.register).toHaveBeenCalledWith("east", { tags: ["kind:agent", "cluster:east"], build: "dev", subsystem: null });
  });

  it("registers east with build abc123 and the subsystem its ConfigMap names", async () => {
    const floor = fakeFloor();
    const subsystem = { version: "0.19.0", clis: { claude: "2.1.311" } };

    await runOneTick(floor, { resources: fakeResources(), secrets: fakeSecrets(), tags: [], build: "abc123", readSubsystem: () => Promise.resolve(subsystem), sleep: async () => {} });

    expect(floor.register).toHaveBeenCalledWith("east", { tags: [], build: "abc123", subsystem });
  });
});
