import { describe, expect, it, vi } from "vitest";
import { runClaimLoop, tokenSecretKey } from "./claim-loop.js";
import type { AgentResourcesApi } from "./kube/agent-resources.js";
import type { SecretKeyWriter } from "./kube/secret-writer.js";
import { createStoppable } from "./lib/stoppable.js";
import type { BriefOutcome, FloorClient } from "@re-cinq/floor-client";
import type { FloorEventView, VisitBrief } from "@re-cinq/floor-contracts";

interface FakeCalls {
  claim: (claiming: { tags: string[]; limit: number }) => Promise<FloorEventView[]>;
  ack: (eventId: string) => Promise<void>;
  fail: (eventId: string, error: string) => Promise<void>;
  brief: (visitId: string) => Promise<BriefOutcome>;
}

interface FakeFloor extends FakeCalls {
  client: FloorClient;
}

function fakeFloor(overrides: Partial<FakeCalls> = {}): FakeFloor {
  const calls: FakeCalls = {
    claim: vi.fn(() => Promise.resolve([] as FloorEventView[])),
    ack: vi.fn(() => Promise.resolve()),
    fail: vi.fn(() => Promise.resolve()),
    brief: vi.fn(() => Promise.resolve({ kind: "absent" } as BriefOutcome)),
    ...overrides,
  };

  return { ...calls, client: { events: calls, stationRuns: { brief: calls.brief } } as unknown as FloorClient };
}

function claiming(events: FloorEventView[]): FakeCalls["claim"] {
  return vi.fn(() => Promise.resolve(events));
}

function dispatchOf(id: string, visitId: string, name = "station_run.dispatch"): FloorEventView {
  return { id, name, payload: { visitId } } as unknown as FloorEventView;
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

const dispatchBrief: VisitBrief = {
  visitId: "v1",
  floorBaseUrl: "http://host.minikube.internal:8080",
  token: "visit-token-abc",
  deadlineMinutes: 20,
  settings: { prompt: "hi", image: "img:1" },
  needs: [],
  produces: [],
  conversation: { mode: "new", save: false },
  iteration: 1,
};

async function runOneTick(floor: FakeFloor, rest: Omit<Parameters<typeof runClaimLoop>[0], "floor">): Promise<void> {
  let ticks = 0;

  await runClaimLoop({
    ...rest,
    floor: floor.client,
    sleep: async () => {
      ticks += 1;
    },
    running: () => ticks === 0,
  });
}

interface DispatchScenario {
  floor: FakeFloor;
  secrets: SecretKeyWriter;
  resources: AgentResourcesApi;
  applied: unknown[];
}

async function dispatchScenario(brief: VisitBrief): Promise<DispatchScenario> {
  const applied: unknown[] = [];
  const floor = fakeFloor({
    claim: claiming([dispatchOf("e1", brief.visitId)]),
    brief: vi.fn(() => Promise.resolve({ kind: "brief", brief } as BriefOutcome)),
  });
  const secrets = fakeSecrets();
  const resources = fakeResources({
    apply: vi.fn((triple) => {
      applied.push(triple);

      return Promise.resolve({ name: `floor-${brief.visitId}`, created: true });
    }),
  });

  await runOneTick(floor, { resources, secrets, tags: ["kind:agent"], sleep: async () => {} });

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

  it("hands the pod the visit token and the floor's broker for a git need, and writes no credential of its own", async () => {
    const scenario = await dispatchScenario({ ...dispatchBrief, needs: [writeGitNeed] });

    expect(scenario.applied).toMatchObject([
      { agent: { spec: { parameters: { git_credential: "visit-token-abc", git_credential_url: "http://host.minikube.internal:8080/station-runs/v1/git-credential" } } } },
    ]);
  });

  it("writes one secret key for a visit with a git need: its own token", async () => {
    const scenario = await dispatchScenario({ ...dispatchBrief, needs: [writeGitNeed] });

    expect(scenario.secrets.setKey).toHaveBeenCalledTimes(1);
  });

  async function dispatchThrowsScenario(): Promise<FakeFloor> {
    const floor = fakeFloor({
      claim: claiming([dispatchOf("e1", "v1")]),
      brief: vi.fn(() => Promise.reject(new Error("brief unavailable"))),
    });

    await runOneTick(floor, { resources: fakeResources(), secrets: fakeSecrets(), tags: [], sleep: async () => {} });

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

async function abortScenario(): Promise<DispatchScenario> {
  const floor = fakeFloor({ claim: claiming([dispatchOf("e2", "v1", "station_run.abort")]) });
  const resources = fakeResources();
  const secrets = fakeSecrets();

  await runOneTick(floor, { resources, secrets, tags: [], sleep: async () => {} });

  return { floor, secrets, resources, applied: [] };
}

describe("runClaimLoop: a dispatch with nothing left to run", () => {
  async function settledScenario(outcome: BriefOutcome): Promise<FakeFloor> {
    const floor = fakeFloor({ claim: claiming([dispatchOf("e1", "v1")]), brief: vi.fn(() => Promise.resolve(outcome)) });

    await runOneTick(floor, { resources: fakeResources(), secrets: fakeSecrets(), tags: [], sleep: async () => {} });

    return floor;
  }

  it("acks a dispatch whose visit already reported, rather than failing it until it dies", async () => {
    const floor = await settledScenario({ kind: "reported" });

    expect({ acked: (floor.ack as unknown as { mock: { calls: unknown[] } }).mock.calls, failed: (floor.fail as unknown as { mock: { calls: unknown[] } }).mock.calls }).toEqual({
      acked: [["e1"]],
      failed: [],
    });
  });

  it("acks a dispatch for a visit that is not there, since asking again would never find it", async () => {
    const floor = await settledScenario({ kind: "absent" });

    expect((floor.ack as unknown as { mock: { calls: unknown[] } }).mock.calls).toEqual([["e1"]]);
  });

  it("creates nothing in the cluster for either", async () => {
    const resources = fakeResources();
    const floor = fakeFloor({ claim: claiming([dispatchOf("e1", "v1")]), brief: vi.fn(() => Promise.resolve({ kind: "reported" } as BriefOutcome)) });

    await runOneTick(floor, { resources, secrets: fakeSecrets(), tags: [], sleep: async () => {} });

    expect(resources.apply).not.toHaveBeenCalled();
  });
});

describe("runClaimLoop: abort", () => {
  it("deletes the CR triple named after the visit", async () => {
    const scenario = await abortScenario();

    expect(scenario.resources.delete).toHaveBeenCalledWith("floor-v1");
  });

  it("deletes the visit's token secret", async () => {
    const scenario = await abortScenario();

    expect(scenario.secrets.deleteKey).toHaveBeenCalledWith("agent-secrets", tokenSecretKey("v1"));
  });

  it("acks the claimed event", async () => {
    const scenario = await abortScenario();

    expect(scenario.floor.ack).toHaveBeenCalledWith("e2");
  });

  it("asks the floor for nothing: a visit long gone has no brief left to give", async () => {
    const scenario = await abortScenario();

    expect(scenario.floor.brief).not.toHaveBeenCalled();
  });
});

describe("runClaimLoop: stopping", () => {
  it("acks the dispatch in flight and claims nothing more once told to stop", async () => {
    const { running, sleep, stop } = createStoppable();
    const claim = claiming([dispatchOf("e1", "v1")]);
    const { calls: claimCalls } = (claim as unknown as { mock: { calls: unknown[] } }).mock;
    const ack = vi.fn(() => Promise.resolve());
    const floor = fakeFloor({
      claim,
      ack,
      brief: vi.fn(() => {
        stop();

        return Promise.resolve({ kind: "brief", brief: dispatchBrief } as BriefOutcome);
      }),
    });

    await runClaimLoop({ floor: floor.client, resources: fakeResources(), secrets: fakeSecrets(), tags: [], running, sleep });

    expect({ acked: ack.mock.calls, claims: claimCalls.length }).toEqual({
      acked: [["e1"]],
      claims: 1,
    });
  });
});
