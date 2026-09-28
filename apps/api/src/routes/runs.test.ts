import { describe, expect, it } from "vitest";
import { authHeaders, injectJson, setupTestServer } from "../test-server.js";

const { server } = setupTestServer();

const LINE_BODY = {
  id: "code-review",
  entry: "review",
  exit: "done",
  args: { pr_url: { kind: "value", subject: true } },
  nodes: [{ id: "review" }, { id: "done" }],
  edges: [{ from: "review", to: "done", on: "success" }],
};

async function seedLine(): Promise<void> {
  await injectJson(server(), { method: "POST", url: "/assembly-lines", headers: authHeaders(), payload: LINE_BODY });
}

function startPayload(prUrl: string): { repo: string; startItems: Record<string, unknown> } {
  return { repo: "github.com/re-cinq/lore", startItems: { pr_url: { kind: "value", ref: prUrl, by: "start" } } };
}

interface StartResult {
  run: { id: string };
  joined: boolean;
}

async function startedRunId(prUrl: string): Promise<string> {
  await seedLine();
  const started = await injectJson<StartResult>(server(), { method: "POST", url: "/assembly-lines/code-review/start", headers: authHeaders(), payload: startPayload(prUrl) });
  const run = started.result.run;

  return run.id;
}

describe("POST /assembly-lines/:id/start", () => {
  it("starts a run and returns 201", async () => {
    await seedLine();

    const response = await injectJson<StartResult>(server(), { method: "POST", url: "/assembly-lines/code-review/start", headers: authHeaders(), payload: startPayload("https://pr/1") });

    expect({ statusCode: response.statusCode, joined: response.result.joined }).toEqual({ statusCode: 201, joined: false });
  });

  it("joins an already-open run on the same subject, returning 200", async () => {
    await seedLine();
    await injectJson(server(), { method: "POST", url: "/assembly-lines/code-review/start", headers: authHeaders(), payload: startPayload("https://pr/1") });

    const second = await injectJson<StartResult>(server(), { method: "POST", url: "/assembly-lines/code-review/start", headers: authHeaders(), payload: startPayload("https://pr/1") });

    expect({ statusCode: second.statusCode, joined: second.result.joined }).toEqual({ statusCode: 200, joined: true });
  });

  it("returns 400 for a line that was never put", async () => {
    const response = await injectJson(server(), { method: "POST", url: "/assembly-lines/missing/start", headers: authHeaders(), payload: startPayload("https://pr/1") });

    expect(response.statusCode).toBe(400);
  });
});

describe("GET /assembly-runs", () => {
  it("requires at least one filter", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/assembly-runs", headers: authHeaders() });

    expect(response.statusCode).toBe(400);
  });

  it("filters to one repo", async () => {
    await seedLine();
    await injectJson(server(), { method: "POST", url: "/assembly-lines/code-review/start", headers: authHeaders(), payload: startPayload("https://pr/1") });

    const response = await injectJson<{ items: unknown[] }>(server(), { method: "GET", url: "/assembly-runs?repo=github.com/re-cinq/lore", headers: authHeaders() });

    expect(response.result.items).toHaveLength(1);
  });
});

describe("GET /assembly-runs/:id", () => {
  it("returns the run and its bag", async () => {
    const runId = await startedRunId("https://pr/1");

    const response = await injectJson<{ bag: Record<string, { kind: string; ref: string; by: string }> }>(server(), { method: "GET", url: `/assembly-runs/${runId}`, headers: authHeaders() });
    const bag = response.result.bag;

    expect(bag.pr_url).toEqual({ kind: "value", ref: "https://pr/1", by: "start" });
  });

  it("returns 404 for an id never started", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/assembly-runs/00000000-0000-0000-0000-000000000000", headers: authHeaders() });

    expect(response.statusCode).toBe(404);
  });
});

describe("POST /assembly-runs/:id/cancel", () => {
  it("settles the run as cancelled", async () => {
    const runId = await startedRunId("https://pr/1");

    const response = await injectJson<{ outcome: string }>(server(), { method: "POST", url: `/assembly-runs/${runId}/cancel`, headers: authHeaders(), payload: { reason: "no longer needed" } });

    expect(response.result.outcome).toBe("cancelled");
  });
});
