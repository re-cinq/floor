import { definitionHash } from "@floor/assembly-lines";
import { describe, expect, it } from "vitest";
import { authHeaders, injectJson, setupTestServer } from "../test-server.js";

const { server, loop } = setupTestServer();

const REVIEWER = { settings: { model: "claude-sonnet-4-6", prompt: "Review the change.", image: "agent:1", timeoutMinutes: 30 } };
const REVIEWER_EDITED_IN_KUBE = { settings: { model: "claude-sonnet-4-6", prompt: "Review the change, line by line.", image: "agent:1", timeoutMinutes: 30 } };

interface ClaimedEvent {
  id: string;
  name: string;
  payload: { id: string; hash: string };
}

async function register(cluster: string): Promise<number> {
  const response = await server().inject({ method: "PUT", url: `/clusters/${cluster}`, headers: authHeaders(), payload: { tags: ["kind:agent"] } });

  return response.statusCode;
}

async function putReviewer(body: object = REVIEWER): Promise<void> {
  await server().inject({ method: "PUT", url: "/agent-definitions/reviewer", headers: authHeaders(), payload: body });
}

async function claimAs(cluster: string): Promise<ClaimedEvent[]> {
  const response = await injectJson<ClaimedEvent[] | null>(server(), {
    method: "POST",
    url: "/events/claim",
    headers: { ...authHeaders(), "x-worker-id": cluster },
    payload: { tags: ["kind:agent", `cluster:${cluster}`], limit: 10 },
  });

  return response.result ?? [];
}

async function report(cluster: string, body: unknown): Promise<void> {
  await server().inject({
    method: "POST",
    url: "/events",
    headers: authHeaders(),
    payload: { name: "agent_definition.reported", payload: { clusterId: cluster, definitionId: "reviewer", body } },
  });
  await loop().pass();
}

async function presence(): Promise<Record<string, { state: string }>> {
  return (await injectJson<Record<string, { state: string }>>(server(), { method: "GET", url: "/agent-definitions/presence", headers: authHeaders() })).result;
}

describe("PUT /clusters/{id}", () => {
  it("answers 204 for a cluster-agent registering with its tags", async () => {
    expect(await register("east")).toBe(204);
  });

  it("answers 400 for a body with no tags", async () => {
    const response = await server().inject({ method: "PUT", url: "/clusters/east", headers: authHeaders(), payload: {} });

    expect(response.statusCode).toBe(400);
  });
});

describe("PUT /agent-definitions/{id}", () => {
  it("queues the new version as an agent_definition.changed event east alone can claim", async () => {
    await register("east");
    await register("west");
    await putReviewer();
    const byEast = await claimAs("east");

    expect(byEast).toMatchObject([{ name: "agent_definition.changed", payload: { id: "reviewer", hash: definitionHash(REVIEWER) } }]);
  });
});

describe("GET /agent-definitions/presence", () => {
  it("answers none for reviewer before any cluster reports it", async () => {
    await register("east");
    await putReviewer();

    expect(await presence()).toMatchObject({ reviewer: { state: "none" } });
  });

  it("answers some while west has not reported the version east holds", async () => {
    await register("east");
    await register("west");
    await putReviewer();
    await report("east", REVIEWER);

    expect(await presence()).toMatchObject({ reviewer: { state: "some" } });
  });

  it("answers all once east and west both report the latest version", async () => {
    await register("east");
    await register("west");
    await putReviewer();
    await report("east", REVIEWER);
    await report("west", REVIEWER);

    expect(await presence()).toMatchObject({ reviewer: { state: "all" } });
  });
});

describe("agent_definition.reported", () => {
  it("adopts a prompt edited in east's kube as reviewer's latest version", async () => {
    await register("east");
    await putReviewer();
    await report("east", REVIEWER_EDITED_IN_KUBE);
    const latest = await injectJson<{ hash: string; createdBy: string }>(server(), { method: "GET", url: "/agent-definitions/reviewer", headers: authHeaders() });

    expect(latest.result).toMatchObject({ hash: definitionHash(REVIEWER_EDITED_IN_KUBE), createdBy: "cluster:east" });
  });

  it("serves the body east read back from its kube at GET /agent-definitions/reviewer/clusters", async () => {
    await register("east");
    await putReviewer();
    await report("east", REVIEWER);
    const clusters = await injectJson<{ items: unknown[] }>(server(), { method: "GET", url: "/agent-definitions/reviewer/clusters", headers: authHeaders() });

    expect(clusters.result.items).toMatchObject([{ clusterId: "east", hash: definitionHash(REVIEWER), body: REVIEWER }]);
  });
});

describe("GET /agent-definitions/{id}/recipes", () => {
  it("answers the base settings and the github.com/re-cinq/otto variant merged over them, as a visit is briefed", async () => {
    await putReviewer({ ...REVIEWER, variants: { "github.com/re-cinq/otto": { model: "gemini-3.1-pro-preview" } } });
    const recipes = await injectJson<{ hash: string; recipes: unknown[] }>(server(), { method: "GET", url: "/agent-definitions/reviewer/recipes", headers: authHeaders() });

    expect(recipes.result.recipes).toEqual([
      { variant: null, settings: { model: "claude-sonnet-4-6", prompt: "Review the change.", image: "agent:1", timeoutMinutes: 30 } },
      { variant: "github.com/re-cinq/otto", settings: { model: "gemini-3.1-pro-preview", prompt: "Review the change.", image: "agent:1", timeoutMinutes: 30 } },
    ]);
  });
});
