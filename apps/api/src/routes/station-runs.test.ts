import { describe, expect, it } from "vitest";
import type { StationRunRecord } from "@floor/store";
import { mintVisitToken } from "../visit-token.js";
import { authHeaders, injectJson, setupTestServer, VISIT_TOKEN_SECRET } from "../test-server.js";
import { SERVICE_STATION, WORK_LINE } from "../test-fixtures.js";

const { server, deps } = setupTestServer();
const FUTURE_DEADLINE = new Date("2026-01-01T01:00:00Z");

function visitAuth(visitId: string): Record<string, string> {
  const token = mintVisitToken(visitId, FUTURE_DEADLINE, VISIT_TOKEN_SECRET);

  return { authorization: `Bearer ${token}` };
}

async function openVisit(): Promise<string> {
  await deps().definitions.put("line", "line", WORK_LINE);
  await deps().definitions.put("station", "work", SERVICE_STATION);
  const { run } = await deps().runs.start({ lineId: "line", repo: "r", startItems: {} });
  const { visit } = await deps().runs.openVisit(run.id, "work", 1);

  return visit.id;
}

async function postRecords(visitId: string, records: { kind: string; body: unknown }[], headers = authHeaders()) {
  return injectJson<{ items: StationRunRecord[] }>(server(), {
    method: "POST",
    url: `/station-runs/${visitId}/records`,
    headers,
    payload: { records: records.map((record) => ({ ...record, occurredAt: "2026-01-01T00:00:00Z" })) },
  });
}

async function getRecords(visitId: string, query: string, headers = authHeaders()) {
  return injectJson<{ items: StationRunRecord[]; nextCursor: number | null }>(server(), {
    method: "GET",
    url: `/station-runs/${visitId}/records${query}`,
    headers,
  });
}

describe("POST /station-runs/{id}/records", () => {
  it("assigns seq starting at 1, per kind", async () => {
    const visitId = await openVisit();

    const response = await postRecords(visitId, [{ kind: "log", body: { line: "one" } }, { kind: "turn", body: {} }]);
    const { items: appended } = response.result;

    expect(appended.map((record) => `${record.kind}:${record.seq}`).sort()).toEqual(["log:1", "turn:1"]);
  });

  it("produces distinct seqs for two concurrent appends to the same visit and kind", async () => {
    const visitId = await openVisit();

    const [first, second] = await Promise.all([
      postRecords(visitId, [{ kind: "log", body: { attempt: 1 } }]),
      postRecords(visitId, [{ kind: "log", body: { attempt: 2 } }]),
    ]);

    const firstItems = first.result.items;
    const secondItems = second.result.items;

    expect(new Set([firstItems[0]!.seq, secondItems[0]!.seq]).size).toBe(2);
  });

  it("refuses a body over the 64 KB cap", async () => {
    const visitId = await openVisit();

    const response = await postRecords(visitId, [{ kind: "log", body: { text: "x".repeat(64 * 1024 + 1) } }]);

    expect(response.statusCode).toBe(400);
  });

  it("gets 403 when a visit token posts for another visit", async () => {
    const visitId = await openVisit();

    const response = await postRecords(visitId, [{ kind: "log", body: {} }], visitAuth("not-this-visit"));

    expect(response.statusCode).toBe(403);
  });

  it("lets a visit token post for its own visit", async () => {
    const visitId = await openVisit();

    const response = await postRecords(visitId, [{ kind: "log", body: {} }], visitAuth(visitId));

    expect(response.statusCode).toBe(201);
  });
});

describe("GET /station-runs/{id}", () => {
  const COUNTED = { costUsd: 0.42, durationMs: 9000, usage: { input_tokens: 900, output_tokens: 400 }, models: { "claude-x": { input_tokens: 900, output_tokens: 400, cost_usd: 0.42 } } };

  async function visitRead(visitId: string) {
    return injectJson<{ id: string; cost: unknown }>(server(), { method: "GET", url: `/station-runs/${visitId}`, headers: authHeaders() });
  }

  it("says what the visit's agent counted and what it cost", async () => {
    const visitId = await openVisit();

    await postRecords(visitId, [{ kind: "llm_call", body: { text: "LORE_NODE_RESULT: success", failed: false, ...COUNTED } }]);
    const response = await visitRead(visitId);

    expect(response.result.cost).toEqual(COUNTED);
  });

  it("says null for a visit no agent counted anything for", async () => {
    const response = await visitRead(await openVisit());

    expect(response.result.cost).toBeNull();
  });

  it("returns 404 for an id that is no visit's, before the database is asked", async () => {
    const response = await visitRead("nonsense");

    expect(response.statusCode).toBe(404);
  });
});

describe("GET /station-runs/{id}/records", () => {
  it("requires the kind filter", async () => {
    const visitId = await openVisit();

    const response = await getRecords(visitId, "");

    expect(response.statusCode).toBe(400);
  });

  it("pages forward with since and a full page's nextCursor", async () => {
    const visitId = await openVisit();

    await postRecords(visitId, [1, 2, 3, 4, 5].map((index) => ({ kind: "log", body: { index } })));
    const firstPage = await getRecords(visitId, "?kind=log&limit=2");
    const { nextCursor } = firstPage.result;
    const secondPage = await getRecords(visitId, `?kind=log&limit=2&since=${nextCursor}`);
    const firstItems = firstPage.result.items;
    const secondItems = secondPage.result.items;

    expect({ first: firstItems.map((record) => record.seq), second: secondItems.map((record) => record.seq) }).toEqual({
      first: [1, 2],
      second: [3, 4],
    });
  });

  it("gets 403 when a visit token reads another visit's records", async () => {
    const visitId = await openVisit();

    const response = await getRecords(visitId, "?kind=log", visitAuth("not-this-visit"));

    expect(response.statusCode).toBe(403);
  });
});
