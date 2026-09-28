import { describe, expect, it, vi } from "vitest";
import { runClaimLoop, tokenSecretKey, gitCredentialSecretKey } from "./claim-loop.js";
import type { AgentResourcesApi } from "./kube/agent-resources.js";
import type { SecretKeyWriter } from "./kube/secret-writer.js";
import type { ClaimedEvent, DispatchBriefResponse, FloorClient } from "./floor-client.js";

function fakeFloor(overrides: Partial<FloorClient> = {}): FloorClient {
  return {
    claim: vi.fn(() => Promise.resolve([] as ClaimedEvent[])),
    ack: vi.fn(() => Promise.resolve()),
    fail: vi.fn(() => Promise.resolve()),
    brief: vi.fn(),
    gitCredential: vi.fn(),
    ...overrides,
  } as unknown as FloorClient;
}

function fakeResources(overrides: Partial<AgentResourcesApi> = {}): AgentResourcesApi {
  return {
    apply: vi.fn(() => Promise.resolve({ name: "x", created: true })),
    delete: vi.fn(() => Promise.resolve({ name: "x", deleted: true })),
    ...overrides,
  };
}

function fakeSecrets(overrides: Partial<SecretKeyWriter> = {}): SecretKeyWriter {
  return {
    setKey: vi.fn(() => Promise.resolve()),
    deleteKey: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

const dispatchBrief: DispatchBriefResponse = {
  visitId: "v1",
  floorBaseUrl: "http://host.minikube.internal:8080",
  token: "visit-token-abc",
  deadlineMinutes: 20,
  settings: { prompt: "hi", image: "img:1" },
  needs: [],
  produces: [],
  conversation: { mode: "new" },
};

async function runOneTick(
  claim: (tags: string[], limit: number) => Promise<ClaimedEvent[]>,
  rest: Parameters<typeof runClaimLoop>[0],
): Promise<void> {
  let ticks = 0;

  await runClaimLoop({
    ...rest,
    floor: fakeFloor({
      claim,
      ack: rest.floor.ack,
      fail: rest.floor.fail,
      brief: rest.floor.brief,
      gitCredential: rest.floor.gitCredential,
    }),
    sleep: async () => {
      ticks += 1;
    },
    running: () => ticks === 0,
  });
}

interface DispatchScenario {
  floor: FloorClient;
  secrets: SecretKeyWriter;
  resources: AgentResourcesApi;
  applied: unknown[];
}

async function dispatchScenario(brief: DispatchBriefResponse): Promise<DispatchScenario> {
  const applied: unknown[] = [];
  const floor = fakeFloor({
    claim: vi.fn(() =>
      Promise.resolve([{ id: "e1", name: "station_run.dispatch", payload: { visitId: brief.visitId } } as ClaimedEvent]),
    ),
    brief: vi.fn(() => Promise.resolve(brief)),
    gitCredential: vi.fn(() => Promise.resolve("ghs_pushtoken")),
  });
  const secrets = fakeSecrets();
  const resources = fakeResources({
    apply: vi.fn((triple) => {
      applied.push(triple);

      return Promise.resolve({ name: `floor-${brief.visitId}`, created: true });
    }),
  });

  await runOneTick(floor.claim, { floor, resources, secrets, tags: ["kind:agent"], sleep: async () => {} });

  return { floor, secrets, resources, applied };
}

const writeGitNeed = {
  name: "workspace", kind: "git" as const, path: "repo", repoUrl: "https://github.com/a/b.git", ref: "main", access: "write" as const,
};

describe("runClaimLoop: dispatch", () => {
  it("writes the visit token into the named secret as the header the subsystem will send", async () => {
    const scenario = await dispatchScenario(dispatchBrief);

    expect(scenario.secrets.setKey).toHaveBeenCalledWith("agent-secrets", tokenSecretKey("v1"), "Authorization: Bearer visit-token-abc");
  });

  it("applies exactly one triple", async () => {
    const scenario = await dispatchScenario(dispatchBrief);

    expect(scenario.applied).toHaveLength(1);
  });

  it("acks the claimed event", async () => {
    const scenario = await dispatchScenario(dispatchBrief);

    expect(scenario.floor.ack).toHaveBeenCalledWith("e1");
  });

  it("exchanges a write-access git need for a push credential", async () => {
    const scenario = await dispatchScenario({ ...dispatchBrief, needs: [writeGitNeed] });

    expect(scenario.floor.gitCredential).toHaveBeenCalledWith("v1");
  });

  it("writes the exchanged push credential under its own key", async () => {
    const scenario = await dispatchScenario({ ...dispatchBrief, needs: [writeGitNeed] });

    expect(scenario.secrets.setKey).toHaveBeenCalledWith(
      "agent-secrets",
      gitCredentialSecretKey("v1", "workspace"),
      "ghs_pushtoken",
    );
  });

  it("never exchanges a read-access git need, since the endpoint refuses it", async () => {
    const withReadNeed = {
      ...dispatchBrief,
      needs: [
        { name: "workspace", kind: "git" as const, path: "repo", repoUrl: "https://github.com/a/b.git", ref: "main", access: "read" as const },
      ],
    };
    const scenario = await dispatchScenario(withReadNeed);

    expect(scenario.floor.gitCredential).not.toHaveBeenCalled();
  });

  async function dispatchThrowsScenario(): Promise<FloorClient> {
    const floor = fakeFloor({
      claim: vi.fn(() =>
        Promise.resolve([{ id: "e1", name: "station_run.dispatch", payload: { visitId: "v1" } } as ClaimedEvent]),
      ),
      brief: vi.fn(() => Promise.reject(new Error("brief unavailable"))),
    });

    await runOneTick(floor.claim, {
      floor,
      resources: fakeResources(),
      secrets: fakeSecrets(),
      tags: [],
      sleep: async () => {},
    });

    return floor;
  }

  it("never acks when the dispatch throws", async () => {
    const floor = await dispatchThrowsScenario();

    expect(floor.ack).not.toHaveBeenCalled();
  });

  it("fails the event with the thrown message when the dispatch throws", async () => {
    const floor = await dispatchThrowsScenario();

    expect(floor.fail).toHaveBeenCalledWith("e1", "brief unavailable");
  });
});

async function abortScenario(brief: DispatchBriefResponse | Error): Promise<DispatchScenario> {
  const floor = fakeFloor({
    claim: vi.fn(() =>
      Promise.resolve([{ id: "e2", name: "station_run.abort", payload: { visitId: "v1" } } as ClaimedEvent]),
    ),
    brief: vi.fn(() => (brief instanceof Error ? Promise.reject(brief) : Promise.resolve(brief))),
  });
  const resources = fakeResources();
  const secrets = fakeSecrets();

  await runOneTick(floor.claim, { floor, resources, secrets, tags: [], sleep: async () => {} });

  return { floor, secrets, resources, applied: [] };
}

describe("runClaimLoop: abort", () => {
  it("deletes the CR triple named after the visit", async () => {
    const scenario = await abortScenario({ ...dispatchBrief, needs: [] });

    expect(scenario.resources.delete).toHaveBeenCalledWith("floor-v1");
  });

  it("deletes the visit's token secret", async () => {
    const scenario = await abortScenario({ ...dispatchBrief, needs: [] });

    expect(scenario.secrets.deleteKey).toHaveBeenCalledWith("agent-secrets", tokenSecretKey("v1"));
  });

  it("acks the claimed event", async () => {
    const scenario = await abortScenario({ ...dispatchBrief, needs: [] });

    expect(scenario.floor.ack).toHaveBeenCalledWith("e2");
  });

  it("reclaims a git credential secret named after each git need the visit had", async () => {
    const withGitNeed = {
      ...dispatchBrief,
      needs: [{ name: "workspace", kind: "git" as const, path: "repo", repoUrl: "u", ref: "main", access: "write" as const }],
    };
    const scenario = await abortScenario(withGitNeed);

    expect(scenario.secrets.deleteKey).toHaveBeenCalledWith("agent-secrets", gitCredentialSecretKey("v1", "workspace"));
  });

  it("still deletes the CR triple when the brief can no longer be fetched", async () => {
    const scenario = await abortScenario(new Error("410 gone"));

    expect(scenario.resources.delete).toHaveBeenCalledWith("floor-v1");
  });

  it("still deletes the token secret when the brief can no longer be fetched", async () => {
    const scenario = await abortScenario(new Error("410 gone"));

    expect(scenario.secrets.deleteKey).toHaveBeenCalledWith("agent-secrets", tokenSecretKey("v1"));
  });
});

async function idleScenario(): Promise<number[]> {
  let ticks = 0;
  const sleeps: number[] = [];
  const floor = fakeFloor({ claim: vi.fn(() => Promise.resolve([])) });

  await runClaimLoop({
    floor,
    resources: fakeResources(),
    secrets: fakeSecrets(),
    tags: [],
    sleep: async (delayMs) => {
      sleeps.push(delayMs);
      ticks += 1;
    },
    running: () => ticks < 2,
  });

  return sleeps;
}

describe("runClaimLoop: idle backoff", () => {
  it("sleeps a positive delay on the first idle tick", async () => {
    const sleeps = await idleScenario();

    expect(sleeps[0]).toBeGreaterThan(0);
  });

  it("never shrinks the delay on a second consecutive idle tick", async () => {
    const sleeps = await idleScenario();

    expect(sleeps[1]).toBeGreaterThanOrEqual(sleeps[0]!);
  });
});
