import { describe, expect, it } from "vitest";
import { authHeaders, injectJson, setupTestServer } from "../test-server.js";
import { workStarted } from "../test-fixtures.js";

const { server, deps } = setupTestServer();

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

  it("starts a run with repo null and returns 201 when the body has no repo and the line has no git argument", async () => {
    await injectJson(server(), { method: "POST", url: "/assembly-lines", headers: authHeaders(), payload: { ...LINE_BODY, args: {} } });

    const response = await injectJson<StartResult>(server(), { method: "POST", url: "/assembly-lines/code-review/start", headers: authHeaders(), payload: { startItems: {} } });

    expect(response).toMatchObject({ statusCode: 201, result: { run: { repo: null } } });
  });

  it("returns 400 naming the line when the body has no repo and the line has a git argument", async () => {
    await injectJson(server(), { method: "POST", url: "/assembly-lines", headers: authHeaders(), payload: { ...LINE_BODY, args: { workspace: { kind: "git" } } } });

    const response = await injectJson(server(), { method: "POST", url: "/assembly-lines/code-review/start", headers: authHeaders(), payload: { startItems: { workspace: { kind: "git", ref: "github.com/re-cinq/lore@main", by: "start" } } } });

    expect(response).toMatchObject({ statusCode: 400, result: { detail: 'line "code-review" has a git argument, so a start must name its repo' } });
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

  it("returns 400 naming every arg problem when pr_url and repo are wrong", async () => {
    await injectJson(server(), { method: "POST", url: "/assembly-lines", headers: authHeaders(), payload: { ...LINE_BODY, args: { ...LINE_BODY.args, repo: { kind: "git" } } } });

    const response = await injectJson<{ errors: string[] }>(server(), { method: "POST", url: "/assembly-lines/code-review/start", headers: authHeaders(), payload: { repo: "r", startItems: { repo: { kind: "value", ref: "x", by: "start" } } } });

    expect({ statusCode: response.statusCode, errors: response.result.errors }).toEqual({
      statusCode: 400,
      errors: ['startItems.repo: the line wants kind "git", got "value"', 'startItems.pr_url: required by the line, as kind "value"'],
    });
  });

  it("starts against the pinned version when lineHash names one", async () => {
    await seedLine();
    const versions = await injectJson<{ items: { hash: string }[] }>(server(), { method: "GET", url: "/assembly-lines/code-review/versions", headers: authHeaders() });
    const [{ hash }] = versions.result.items;

    const response = await injectJson<{ run: { lineHash: string } }>(server(), { method: "POST", url: "/assembly-lines/code-review/start", headers: authHeaders(), payload: { ...startPayload("https://pr/1"), lineHash: hash } });

    const { run } = response.result;

    expect(run.lineHash).toBe(hash);
  });

  it("returns 400 when lineHash is not a version of the line", async () => {
    await seedLine();

    const response = await injectJson(server(), { method: "POST", url: "/assembly-lines/code-review/start", headers: authHeaders(), payload: { ...startPayload("https://pr/1"), lineHash: "sha256-nope" } });

    expect(response.statusCode).toBe(400);
  });
});

describe("GET /assembly-runs", () => {
  it("requires at least one filter", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/assembly-runs", headers: authHeaders() });

    expect(response.statusCode).toBe(400);
  });

  it("lists only the runs with no repo when withoutRepo is true", async () => {
    await injectJson(server(), { method: "POST", url: "/assembly-lines", headers: authHeaders(), payload: { ...LINE_BODY, args: {} } });
    await injectJson(server(), { method: "POST", url: "/assembly-lines/code-review/start", headers: authHeaders(), payload: { repo: "github.com/re-cinq/lore", startItems: {} } });
    await injectJson(server(), { method: "POST", url: "/assembly-lines/code-review/start", headers: authHeaders(), payload: { startItems: {} } });

    const response = await injectJson(server(), { method: "GET", url: "/assembly-runs?withoutRepo=true", headers: authHeaders() });

    expect(response).toMatchObject({ statusCode: 200, result: { items: [{ repo: null }] } });
  });

  it("returns 400 when withoutRepo and repo are asked for together", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/assembly-runs?withoutRepo=true&repo=github.com/re-cinq/lore", headers: authHeaders() });

    expect(response).toMatchObject({ statusCode: 400, result: { detail: "withoutRepo and repo cannot be asked for together" } });
  });

  it("filters to one repo", async () => {
    await seedLine();
    await injectJson(server(), { method: "POST", url: "/assembly-lines/code-review/start", headers: authHeaders(), payload: startPayload("https://pr/1") });

    const response = await injectJson<{ items: unknown[] }>(server(), { method: "GET", url: "/assembly-runs?repo=github.com/re-cinq/lore", headers: authHeaders() });

    expect(response.result.items).toHaveLength(1);
  });
});

describe("GET /assembly-runs since", () => {
  async function runIdsSince(query: string): Promise<{ statusCode: number; ids: string[] }> {
    await startedRunId("https://pr/1");
    const response = await injectJson<{ items: { id: string }[] }>(server(), { method: "GET", url: `/assembly-runs?${query}`, headers: authHeaders() });

    const { items: listedRuns } = response.result;

    return { statusCode: response.statusCode, ids: listedRuns.map((run) => run.id) };
  }

  it("counts as the one filter required, and keeps a run created since 2020-01-01", async () => {
    const { statusCode, ids } = await runIdsSince("since=2020-01-01");

    expect({ statusCode, count: ids.length }).toEqual({ statusCode: 200, count: 1 });
  });

  it("returns nothing when since is 2999-01-01", async () => {
    const { ids } = await runIdsSince("since=2999-01-01");

    expect(ids).toEqual([]);
  });

  it("combines with repo", async () => {
    const { ids } = await runIdsSince("repo=github.com/re-cinq/lore&since=2999-01-01");

    expect(ids).toEqual([]);
  });

  it("is no cursor: a since that is no date is ignored and the run still shows", async () => {
    const { ids } = await runIdsSince("repo=github.com/re-cinq/lore&since=not-a-date");

    expect(ids).toHaveLength(1);
  });
});

describe("GET /assembly-runs newest first", () => {
  interface RunsPage {
    items: { id: string; createdAt: string }[];
    nextCursor: string | null;
  }

  async function wirePage(query: string): Promise<{ statusCode: number; page: RunsPage }> {
    const response = await injectJson(server(), { method: "GET", url: `/assembly-runs?since=2020-01-01&${query}`, headers: authHeaders() });

    return { statusCode: response.statusCode, page: JSON.parse(response.rawPayload.toString()) as RunsPage };
  }

  it("lists the run started 03-03 before the run started 03-01, each with its createdAt, and pages on with the cursor it returned", async () => {
    const older = await startedRunId("https://pr/1");
    const newer = await startedRunId("https://pr/2");

    await deps().pool.query("update assembly_runs set created_at = '2026-03-01T10:00:00Z' where id = $1", [older]);
    await deps().pool.query("update assembly_runs set created_at = '2026-03-03T10:00:00Z' where id = $1", [newer]);
    const { page: first } = await wirePage("limit=1");
    const { page: second } = await wirePage(`limit=1&cursor=${first.nextCursor}`);

    expect([first.items, second.items]).toMatchObject([
      [{ id: newer, createdAt: "2026-03-03T10:00:00.000Z" }],
      [{ id: older, createdAt: "2026-03-01T10:00:00.000Z" }],
    ]);
  });

  it("returns 400 for a cursor that is a bare run id", async () => {
    const runId = await startedRunId("https://pr/1");

    const { statusCode } = await wirePage(`cursor=${runId}`);

    expect(statusCode).toBe(400);
  });
});

describe("GET /assembly-runs/:id currentNode and cost", () => {
  const COUNTED = { kind: "llm_call" as const, body: { costUsd: 2, usage: { input_tokens: 5, output_tokens: 7 } }, occurredAt: new Date("2026-01-01T00:00:00Z") };

  async function runRead(runId: string) {
    return injectJson<{ currentNode: string | null; cost: unknown }>(server(), { method: "GET", url: `/assembly-runs/${runId}`, headers: authHeaders() });
  }

  it("says null and null for a run with no visit", async () => {
    const response = await runRead(await startedRunId("https://pr/1"));

    expect(response.result).toMatchObject({ currentNode: null, cost: null });
  });

  it("says the open visit's node, and null cost while nothing is counted", async () => {
    const { runId } = await workStarted(deps());
    const response = await runRead(runId);

    expect(response.result).toMatchObject({ currentNode: "work", cost: null });
  });

  async function costRead() {
    const { runId, visitId } = await workStarted(deps());

    await deps().records.append(visitId, [COUNTED]);

    return { runId, response: await runRead(runId) };
  }

  it("says what CostsStore sums for the run", async () => {
    const { runId, response } = await costRead();

    expect(response.result.cost).toEqual(await deps().costs.ofRun(runId));
  });

  it("says the counted cost as its figures", async () => {
    const { response } = await costRead();

    expect(response.result.cost).toMatchObject({ costUsd: 2, tokensIn: 5, tokensOut: 7 });
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

describe("POST /assembly-lines/:id/start with a line file", () => {
  it("seeds the line's file into the started run's bag", async () => {
    const blob = await injectJson<{ hash: string }>(server(), { method: "POST", url: "/blobs", headers: authHeaders(), payload: Buffer.from("plan text") });
    const line = {
      id: "with-file",
      entry: "review",
      exit: "done",
      args: {},
      files: { plan: blob.result.hash },
      nodes: [{ id: "review" }, { id: "done" }],
      edges: [{ from: "review", to: "done", on: "success" }],
    };
    await injectJson(server(), { method: "POST", url: "/assembly-lines", headers: authHeaders(), payload: line });
    const started = await injectJson<StartResult>(server(), { method: "POST", url: "/assembly-lines/with-file/start", headers: authHeaders(), payload: { repo: "r", startItems: {} } });
    const { run } = started.result;

    const response = await injectJson<{ bag: Record<string, { kind: string; ref: string; by: string }> }>(server(), { method: "GET", url: `/assembly-runs/${run.id}`, headers: authHeaders() });
    const { bag } = response.result;

    expect(bag.plan).toEqual({ kind: "file", ref: blob.result.hash, by: "line" });
  });
});

describe("POST /assembly-runs/:id/cancel", () => {
  it("settles the run as cancelled", async () => {
    const runId = await startedRunId("https://pr/1");

    const response = await injectJson<{ outcome: string }>(server(), { method: "POST", url: `/assembly-runs/${runId}/cancel`, headers: authHeaders(), payload: { reason: "no longer needed" } });

    expect(response.result.outcome).toBe("cancelled");
  });
});
