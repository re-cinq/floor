import { describe, expect, it } from "vitest";
import type { AgentDefinitionBody, LineBody, StationBody } from "@floor/store";
import { mintVisitToken } from "../visit-token.js";
import { VISIT_TOKEN_SECRET, authHeaders, injectJson, setupTestServer } from "../test-server.js";

const { server, deps } = setupTestServer();
const FUTURE_DEADLINE = new Date("2026-01-01T01:00:00Z");

const OCCURRED_AT = new Date("2026-01-01T00:00:00Z");

const LINE: LineBody = {
  entry: "assess",
  exit: "done",
  args: {},
  nodes: [{ id: "assess", station: "review" }, { id: "done" }],
  edges: [{ from: "assess", to: "done", on: "success" }],
};
const STATION: StationBody = { kind: "agent", agentDefinition: "reviewer", outcomes: ["success"], needs: [], produces: [] };
const AGENT_DEFINITION: AgentDefinitionBody = { settings: { model: "claude-x", prompt: "p", image: "img:1", timeoutMinutes: 20 } };

async function openedVisit(repo: string): Promise<string> {
  await seedCostsLine();
  const { run } = await deps().runs.start({ lineId: "code-review", repo, startItems: {} });
  const { visit } = await deps().runs.openVisit(run.id, "assess", 1);

  await deps().runs.report(visit.id, { outcome: "success" });

  return visit.id;
}

async function seedCostsLine(): Promise<void> {
  await deps().definitions.put("line", "code-review", LINE);
  await deps().definitions.put("station", "review", STATION);
  await deps().definitions.put("agent_definition", "reviewer", AGENT_DEFINITION);
}

async function reportedVisit(repo: string, costUsd: number): Promise<void> {
  const visitId = await openedVisit(repo);

  await deps().records.append(visitId, [{ kind: "llm_call", body: { costUsd, usage: {} }, occurredAt: OCCURRED_AT }]);
}

interface CostsResult {
  items: { key: string; costUsd: number; tokensIn: number; tokensOut: number; visits: number; visitsMissingCost: number }[];
}

async function missingCostFor(repo: string): Promise<number> {
  const response = await injectJson<CostsResult>(server(), { method: "GET", url: `/costs?repo=${repo}&group=line`, headers: authHeaders() });
  const [row] = response.result.items;

  return row!.visitsMissingCost;
}

describe("GET /costs", () => {
  it("returns cost summed by line", async () => {
    await reportedVisit("r", 3);

    const response = await injectJson<CostsResult>(server(), { method: "GET", url: "/costs?repo=r&group=line", headers: authHeaders() });

    expect(response.result.items).toEqual([{ key: "code-review", costUsd: 3, tokensIn: 0, tokensOut: 0, visits: 1, visitsMissingCost: 0, unpriced: [] }]);
  });

  it("returns what one run cost, asked for by its id", async () => {
    await reportedVisit("r", 3);
    await reportedVisit("r", 4);
    const listed = await deps().runs.list({ repo: "r" }, { limit: 1 });
    const [run] = listed.items;

    const response = await injectJson<CostsResult>(server(), { method: "GET", url: `/costs?run=${run!.id}&group=run`, headers: authHeaders() });

    expect(response.result.items).toMatchObject([{ key: run!.id, visits: 1 }]);
  });

  it("answers 400 to a run that is no run's id, before the database is asked", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/costs?run=nonsense&group=run", headers: authHeaders() });

    expect(response.statusCode).toBe(400);
  });

  it("splits a visit's cost by the models that did the work, the one called on the side included", async () => {
    const visitId = await openedVisit("r");
    const models = { "claude-x": { input_tokens: 900, output_tokens: 400, cost_usd: 0.4 }, "claude-small": { input_tokens: 120, output_tokens: 30, cost_usd: 0.02 } };

    await deps().records.append(visitId, [{ kind: "llm_call", body: { costUsd: 0.42, usage: {}, models }, occurredAt: OCCURRED_AT }]);
    const response = await injectJson<CostsResult>(server(), { method: "GET", url: "/costs?repo=r&group=model", headers: authHeaders() });

    expect(response.result.items).toMatchObject([
      { key: "claude-small", costUsd: 0.02, tokensIn: 120, tokensOut: 30, visits: 1 },
      { key: "claude-x", costUsd: 0.4, tokensIn: 900, tokensOut: 400, visits: 1 },
    ]);
  });

  it("keeps a visit's cost whole, under the model its definition names, when its models say nothing of cost", async () => {
    const visitId = await openedVisit("r");

    await deps().records.append(visitId, [{ kind: "llm_call", body: { costUsd: 0.4, usage: { input_tokens: 900 }, models: { "claude-small": { input_tokens: 900 } } }, occurredAt: OCCURRED_AT }]);
    const response = await injectJson<CostsResult>(server(), { method: "GET", url: "/costs?repo=r&group=model", headers: authHeaders() });

    expect(response.result.items).toMatchObject([{ key: "claude-x", costUsd: 0.4, tokensIn: 900 }]);
  });

  it("names the models it had no price for", async () => {
    const visitId = await openedVisit("r");

    await deps().records.append(visitId, [{ kind: "llm_call", body: { costUsd: 0.4, usage: {}, unpriced: ["gemini-3-flash-preview"] }, occurredAt: OCCURRED_AT }]);
    const response = await injectJson<CostsResult>(server(), { method: "GET", url: "/costs?repo=r&group=line", headers: authHeaders() });

    expect(response.result.items).toMatchObject([{ key: "code-review", unpriced: ["gemini-3-flash-preview"] }]);
  });

  it("groups by day", async () => {
    await reportedVisit("r", 3);

    const response = await injectJson<CostsResult>(server(), { method: "GET", url: "/costs?repo=r&group=day", headers: authHeaders() });

    expect(response.result.items).toHaveLength(1);
  });

  it("groups by model", async () => {
    await reportedVisit("r", 3);

    const response = await injectJson<CostsResult>(server(), { method: "GET", url: "/costs?repo=r&group=model", headers: authHeaders() });

    expect(response.result.items).toEqual([{ key: "claude-x", costUsd: 3, tokensIn: 0, tokensOut: 0, visits: 1, visitsMissingCost: 0, unpriced: [] }]);
  });

  it("filters by line", async () => {
    await reportedVisit("r", 3);

    const response = await injectJson<CostsResult>(server(), { method: "GET", url: "/costs?line=code-review&group=station", headers: authHeaders() });

    expect(response.result.items).toHaveLength(1);
  });

  it("filters by station", async () => {
    await reportedVisit("r", 3);

    const response = await injectJson<CostsResult>(server(), { method: "GET", url: "/costs?station=review&group=line", headers: authHeaders() });

    expect(response.result.items).toHaveLength(1);
  });

  it("filters by since and until", async () => {
    await reportedVisit("r", 3);

    const response = await injectJson<CostsResult>(server(), { method: "GET", url: "/costs?since=2020-01-01&until=2999-01-01&group=line", headers: authHeaders() });

    expect(response.result.items).toHaveLength(1);
  });

  it("counts a visit with no llm_call record as missing", async () => {
    await openedVisit("r");

    expect(await missingCostFor("r")).toBe(1);
  });

  it("never counts a human visit as missing", async () => {
    const humanLine: LineBody = { entry: "approve", exit: "done", args: {}, nodes: [{ id: "approve", station: "approve" }, { id: "done" }], edges: [{ from: "approve", to: "done", on: "success" }] };
    const humanStation: StationBody = { kind: "human", outcomes: ["success"], needs: [], produces: [] };

    await deps().definitions.put("line", "human-line", humanLine);
    await deps().definitions.put("station", "approve", humanStation);
    const { run } = await deps().runs.start({ lineId: "human-line", repo: "r", startItems: {} });
    const { visit } = await deps().runs.openVisit(run.id, "approve", 1);
    await deps().runs.report(visit.id, { outcome: "success" });

    expect(await missingCostFor("r")).toBe(0);
  });

  it("requires at least one filter", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/costs?group=line", headers: authHeaders() });

    expect(response.statusCode).toBe(400);
  });

  it("requires a group", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/costs?repo=r", headers: authHeaders() });

    expect(response.statusCode).toBe(400);
  });

  it("refuses a visit token", async () => {
    const token = mintVisitToken("visit-1", FUTURE_DEADLINE, VISIT_TOKEN_SECRET);

    const response = await injectJson(server(), { method: "GET", url: "/costs?repo=r&group=line", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(403);
  });
});
