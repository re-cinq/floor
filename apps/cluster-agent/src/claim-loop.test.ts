import { describe, expect, it, vi } from "vitest";
import { runClaimLoop, tokenSecretKey } from "./claim-loop.js";
import { claiming, dispatchBrief, dispatchOf, fakeFloor, fakeResources, fakeSecrets, runOneTick, type FakeFloor } from "./claim-loop.fixtures.js";
import type { AgentResourcesApi } from "./kube/agent-resources.js";
import type { SecretKeyWriter } from "./kube/secret-writer.js";
import { createStoppable } from "./lib/stoppable.js";
import type { BriefOutcome } from "@re-cinq/floor-client";
import type { VisitBrief } from "@re-cinq/floor-contracts";

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

function callsOf(spied: unknown): unknown[][] {
  return (spied as { mock: { calls: unknown[][] } }).mock.calls;
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

  const search = { name: "search", transport: "http" as const, url: "http://search.test/mcp", visitToken: { audience: "search", scopes: ["context:read"] } };
  const lore = { ...search, name: "lore", url: "http://lore.test/mcp" };

  function asking(servers: (typeof search)[], serverTokens?: Record<string, string>): VisitBrief {
    return { ...dispatchBrief, settings: { prompt: "hi", image: "img:1", mcpServers: servers }, serverTokens };
  }

  it("writes each server's gateway token under its own key as a bearer value, in place of whatever those keys held, beside the visit token", async () => {
    const scenario = await dispatchScenario(asking([search, lore], { search: "jwt-search", lore: "jwt-lore" }));

    expect({ visitToken: callsOf(scenario.secrets.setKey), gatewayTokens: callsOf(scenario.secrets.replaceKeys) }).toEqual({
      visitToken: [["agent-secrets", "visit-v1-token", "Authorization: Bearer visit-token-abc"]],
      gatewayTokens: [["agent-secrets", "visit-v1-gateway-token.", { "visit-v1-gateway-token.search": "Bearer jwt-search", "visit-v1-gateway-token.lore": "Bearer jwt-lore" }]],
    });
  });

  it("writes nothing beside the visit token for a brief with no server tokens", async () => {
    const scenario = await dispatchScenario(dispatchBrief);

    expect({ set: callsOf(scenario.secrets.setKey).length, replaced: callsOf(scenario.secrets.replaceKeys) }).toEqual({ set: 1, replaced: [] });
  });

  it("opens the server with the key its gateway token was written under", async () => {
    const scenario = await dispatchScenario(asking([search], { search: "jwt-search" }));

    expect(scenario.applied).toMatchObject([{ agentDefinition: { spec: { resources: { mcp_servers: [{ name: "search", headers_secret: "visit-v1-gateway-token.search" }] } } } }]);
  });

  it("fails the dispatch of a server that asks for a token the brief does not carry, naming the server", async () => {
    const scenario = await dispatchScenario(asking([search]));

    expect(scenario.floor.fail).toHaveBeenCalledWith("e1", 'MCP server "search" asks for a gateway token, and the brief of station run "v1" carries none for it, so no pod is started');
  });

  it("creates nothing in the cluster and writes no secret key for it", async () => {
    const scenario = await dispatchScenario(asking([search]));

    expect({ applied: scenario.applied, set: callsOf(scenario.secrets.setKey), replaced: callsOf(scenario.secrets.replaceKeys), acked: callsOf(scenario.floor.ack) }).toEqual({ applied: [], set: [], replaced: [], acked: [] });
  });

  it("fails the dispatch of two servers whose tokens would share a key, and creates nothing", async () => {
    const scenario = await dispatchScenario(asking([{ ...search, name: "my search" }, { ...search, name: "my_search" }], { "my search": "jwt-1", my_search: "jwt-2" }));

    expect({ failed: callsOf(scenario.floor.fail), applied: scenario.applied, replaced: callsOf(scenario.secrets.replaceKeys) }).toEqual({
      failed: [["e1", 'MCP servers "my search" and "my_search" both ask for a gateway token, and their names are too alike to keep the two tokens apart: rename one']],
      applied: [],
      replaced: [],
    });
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
  it("deletes the Agent named after the visit", async () => {
    const scenario = await abortScenario();

    expect(scenario.resources.delete).toHaveBeenCalledWith("floor-v1");
  });

  it("deletes the visit's token secret", async () => {
    const scenario = await abortScenario();

    expect(scenario.secrets.deleteKey).toHaveBeenCalledWith("agent-secrets", tokenSecretKey("v1"));
  });

  it("deletes every gateway token key of the visit", async () => {
    const scenario = await abortScenario();

    expect(scenario.secrets.replaceKeys).toHaveBeenCalledWith("agent-secrets", "visit-v1-gateway-token.", {});
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

    await runClaimLoop({ clusterId: "east", floor: floor.client, resources: fakeResources(), secrets: fakeSecrets(), tags: [], running, sleep });

    expect({ acked: ack.mock.calls, claims: claimCalls.length }).toEqual({
      acked: [["e1"]],
      claims: 1,
    });
  });
});

async function aliveLogCount(nowValues: number[]): Promise<number> {
  let ticks = 0;
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

  await runClaimLoop({
    clusterId: "east",
    floor: fakeFloor().client,
    resources: fakeResources(),
    secrets: fakeSecrets(),
    tags: [],
    now: () => nowValues[Math.min(ticks, nowValues.length - 1)]!,
    sleep: async () => {
      ticks += 1;
    },
    running: () => ticks < nowValues.length,
  });
  const { calls } = logSpy.mock;
  const aliveLogs = calls.filter(([line]) => typeof line === "string" && line.includes("alive"));

  logSpy.mockRestore();

  return aliveLogs.length;
}

describe("runClaimLoop: liveness log", () => {
  it("logs alive once across two quick ticks inside the same minute", async () => {
    expect(await aliveLogCount([0, 1_000])).toBe(1);
  });

  it("logs alive again once a minute has passed between ticks", async () => {
    expect(await aliveLogCount([0, 60_000])).toBe(2);
  });
});

describe("runClaimLoop: sweeping unused recipes", () => {
  async function runTicks(times: number[], resources: AgentResourcesApi, onError?: (error: unknown) => void): Promise<void> {
    let tick = 0;

    await runClaimLoop({
      clusterId: "east",
      floor: fakeFloor().client,
      resources,
      secrets: fakeSecrets(),
      tags: [],
      now: () => times[Math.min(tick, times.length - 1)]!,
      sleep: async () => {
        tick += 1;
      },
      running: () => tick < times.length,
      onError,
    });
  }

  it("sweeps after its first tick, at the loop's clock", async () => {
    const resources = fakeResources();

    await runTicks([Date.parse("2026-10-30T12:00:00Z")], resources);

    expect(resources.sweep).toHaveBeenCalledWith(new Date("2026-10-30T12:00:00Z"));
  });

  it("sweeps twice over ticks at 0, 5 and 11 minutes, once ten minutes have passed", async () => {
    const resources = fakeResources();
    const minute = 60_000;

    await runTicks([0, 5 * minute, 11 * minute], resources);

    expect(resources.sweep).toHaveBeenCalledTimes(2);
  });

  it("tells onError of a sweep that failed and goes on claiming", async () => {
    const failure = new Error("list stations: 503");
    const resources = fakeResources({ sweep: vi.fn(() => Promise.reject(failure)) });
    const errors: unknown[] = [];

    await runTicks([0, 1], resources, (error) => errors.push(error));

    expect(errors).toEqual([failure]);
  });
});
