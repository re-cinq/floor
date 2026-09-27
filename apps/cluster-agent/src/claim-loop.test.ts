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

// Runs the loop for exactly one tick by making `running()` false after the
// first sleep call, the same "bound the loop in tests" convention lore's
// poll-loop uses.
async function runOneTick(
  claim: (tags: string[], limit: number) => Promise<ClaimedEvent[]>,
  rest: Parameters<typeof runClaimLoop>[0],
) {
  let ticks = 0;

  await runClaimLoop({
    ...rest,
    floor: fakeFloor({ claim, ack: rest.floor.ack, fail: rest.floor.fail, brief: rest.floor.brief, gitCredential: rest.floor.gitCredential }),
    sleep: async () => {
      ticks += 1;
    },
    running: () => ticks === 0,
  });
}

describe("runClaimLoop: dispatch", () => {
  it("fetches the brief, writes the visit token secret, applies the triple, and acks", async () => {
    const applied: unknown[] = [];
    const floor = fakeFloor({
      claim: vi.fn(() =>
        Promise.resolve([{ id: "e1", name: "station_run.dispatch", payload: { visitId: "v1" } } as ClaimedEvent]),
      ),
      brief: vi.fn(() => Promise.resolve(dispatchBrief)),
    });
    const secrets = fakeSecrets();
    const resources = fakeResources({
      apply: vi.fn((triple) => {
        applied.push(triple);

        return Promise.resolve({ name: "floor-v1", created: true });
      }),
    });

    await runOneTick(floor.claim, {
      floor,
      resources,
      secrets,
      tags: ["kind:agent"],
      sleep: async () => {},
    });

    expect(secrets.setKey).toHaveBeenCalledWith("agent-secrets", tokenSecretKey("v1"), "visit-token-abc");
    expect(applied).toHaveLength(1);
    expect(floor.ack).toHaveBeenCalledWith("e1");
  });

  it("exchanges a write-access git need for a push credential and writes it under its own key", async () => {
    const floor = fakeFloor({
      claim: vi.fn(() =>
        Promise.resolve([{ id: "e1", name: "station_run.dispatch", payload: { visitId: "v1" } } as ClaimedEvent]),
      ),
      brief: vi.fn(() =>
        Promise.resolve({
          ...dispatchBrief,
          needs: [
            { name: "workspace", kind: "git" as const, path: "repo", repoUrl: "https://github.com/a/b.git", ref: "main", access: "write" as const },
          ],
        }),
      ),
      gitCredential: vi.fn(() => Promise.resolve("ghs_pushtoken")),
    });
    const secrets = fakeSecrets();
    const resources = fakeResources();

    await runOneTick(floor.claim, { floor, resources, secrets, tags: [], sleep: async () => {} });

    expect(floor.gitCredential).toHaveBeenCalledWith("v1");
    expect(secrets.setKey).toHaveBeenCalledWith(
      "agent-secrets",
      gitCredentialSecretKey("v1", "workspace"),
      "ghs_pushtoken",
    );
  });

  it("never exchanges a read-access git need, since the endpoint refuses it", async () => {
    const floor = fakeFloor({
      claim: vi.fn(() =>
        Promise.resolve([{ id: "e1", name: "station_run.dispatch", payload: { visitId: "v1" } } as ClaimedEvent]),
      ),
      brief: vi.fn(() =>
        Promise.resolve({
          ...dispatchBrief,
          needs: [
            { name: "workspace", kind: "git" as const, path: "repo", repoUrl: "https://github.com/a/b.git", ref: "main", access: "read" as const },
          ],
        }),
      ),
    });

    await runOneTick(floor.claim, {
      floor,
      resources: fakeResources(),
      secrets: fakeSecrets(),
      tags: [],
      sleep: async () => {},
    });

    expect(floor.gitCredential).not.toHaveBeenCalled();
  });

  it("fails the event, rather than acking, when the dispatch throws", async () => {
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

    expect(floor.ack).not.toHaveBeenCalled();
    expect(floor.fail).toHaveBeenCalledWith("e1", "brief unavailable");
  });
});

describe("runClaimLoop: abort", () => {
  it("deletes the CR triple and the visit's token secret, then acks", async () => {
    const floor = fakeFloor({
      claim: vi.fn(() =>
        Promise.resolve([{ id: "e2", name: "station_run.abort", payload: { visitId: "v1" } } as ClaimedEvent]),
      ),
      brief: vi.fn(() => Promise.resolve({ ...dispatchBrief, needs: [] })),
    });
    const resources = fakeResources();
    const secrets = fakeSecrets();

    await runOneTick(floor.claim, { floor, resources, secrets, tags: [], sleep: async () => {} });

    expect(resources.delete).toHaveBeenCalledWith("floor-v1");
    expect(secrets.deleteKey).toHaveBeenCalledWith("agent-secrets", tokenSecretKey("v1"));
    expect(floor.ack).toHaveBeenCalledWith("e2");
  });

  it("also reclaims a git credential secret named after each git need the visit had", async () => {
    const floor = fakeFloor({
      claim: vi.fn(() =>
        Promise.resolve([{ id: "e2", name: "station_run.abort", payload: { visitId: "v1" } } as ClaimedEvent]),
      ),
      brief: vi.fn(() =>
        Promise.resolve({
          ...dispatchBrief,
          needs: [{ name: "workspace", kind: "git" as const, path: "repo", repoUrl: "u", ref: "main", access: "write" as const }],
        }),
      ),
    });
    const secrets = fakeSecrets();

    await runOneTick(floor.claim, { floor, resources: fakeResources(), secrets, tags: [], sleep: async () => {} });

    expect(secrets.deleteKey).toHaveBeenCalledWith("agent-secrets", gitCredentialSecretKey("v1", "workspace"));
  });

  it("still deletes the CR triple and the token secret when the brief can no longer be fetched (the visit is long gone)", async () => {
    const floor = fakeFloor({
      claim: vi.fn(() =>
        Promise.resolve([{ id: "e2", name: "station_run.abort", payload: { visitId: "v1" } } as ClaimedEvent]),
      ),
      brief: vi.fn(() => Promise.reject(new Error("410 gone"))),
    });
    const resources = fakeResources();
    const secrets = fakeSecrets();

    await runOneTick(floor.claim, { floor, resources, secrets, tags: [], sleep: async () => {} });

    expect(resources.delete).toHaveBeenCalledWith("floor-v1");
    expect(secrets.deleteKey).toHaveBeenCalledWith("agent-secrets", tokenSecretKey("v1"));
    expect(floor.ack).toHaveBeenCalledWith("e2");
  });
});

describe("runClaimLoop: idle backoff", () => {
  it("does not sleep zero when nothing was claimed", async () => {
    const sleeps: number[] = [];
    let ticks = 0;
    const floor = fakeFloor({ claim: vi.fn(() => Promise.resolve([])) });

    await runClaimLoop({
      floor,
      resources: fakeResources(),
      secrets: fakeSecrets(),
      tags: [],
      sleep: async (ms) => {
        sleeps.push(ms);
        ticks += 1;
      },
      running: () => ticks < 2,
    });

    expect(sleeps[0]).toBeGreaterThan(0);
    expect(sleeps[1]).toBeGreaterThanOrEqual(sleeps[0]!);
  });
});
