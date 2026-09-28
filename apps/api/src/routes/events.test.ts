import { describe, expect, it } from "vitest";
import { mintVisitToken } from "../visit-token.js";
import { VISIT_TOKEN_SECRET, authHeaders, injectJson, setupTestServer } from "../test-server.js";

const { server, deps, pool } = setupTestServer();
const FUTURE_DEADLINE = new Date("2026-01-01T01:00:00Z");

async function enqueueDispatch(tags: string[]): Promise<string> {
  const response = await injectJson<{ id: string }>(server(), {
    method: "POST",
    url: "/events",
    headers: authHeaders(),
    payload: { name: "station_run.dispatch", payload: { visitId: "v1" }, tags },
  });

  return response.result.id;
}

describe("POST /events", () => {
  it("enqueues and returns 201", async () => {
    const response = await injectJson(server(), { method: "POST", url: "/events", headers: authHeaders(), payload: { name: "manual.tick", payload: {} } });

    expect(response.statusCode).toBe(201);
  });

  it("returns 400 for an invalid body", async () => {
    const response = await injectJson(server(), { method: "POST", url: "/events", headers: authHeaders(), payload: { payload: {} } });

    expect(response.statusCode).toBe(400);
  });
});

describe("GET /events", () => {
  it("requires at least one filter", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/events", headers: authHeaders() });

    expect(response.statusCode).toBe(400);
  });

  it("filters by run alone", async () => {
    const runId = "00000000-0000-4000-8000-000000000001";
    const posted = await injectJson<{ id: string }>(server(), { method: "POST", url: "/events", headers: authHeaders(), payload: { name: "node.review.start", payload: {}, runId } });

    const response = await injectJson<{ items: { id: string }[] }>(server(), { method: "GET", url: `/events?run=${runId}`, headers: authHeaders() });
    const matchedEvents = response.result.items;

    expect(matchedEvents.map((event) => event.id)).toEqual([posted.result.id]);
  });

  it("filters by name alone", async () => {
    await injectJson(server(), { method: "POST", url: "/events", headers: authHeaders(), payload: { name: "manual.tick", payload: {} } });

    const response = await injectJson<{ items: { name: string }[] }>(server(), { method: "GET", url: "/events?name=manual.tick", headers: authHeaders() });
    const matchedEvents = response.result.items;

    expect(matchedEvents.map((event) => event.name)).toEqual(["manual.tick"]);
  });

  it("filters by since alone, excluding what came before the cursor", async () => {
    const first = await injectJson<{ id: string }>(server(), { method: "POST", url: "/events", headers: authHeaders(), payload: { name: "manual.tick", payload: {} } });
    await injectJson(server(), { method: "POST", url: "/events", headers: authHeaders(), payload: { name: "manual.tick", payload: {} } });

    const response = await injectJson<{ items: unknown[] }>(server(), { method: "GET", url: `/events?since=${first.result.id}`, headers: authHeaders() });

    expect(response.result.items).toHaveLength(1);
  });

  it("filters by station-run alone", async () => {
    await injectJson(server(), { method: "POST", url: "/events", headers: authHeaders(), payload: { name: "station_run.reported", payload: { visitId: "v9" } } });

    const response = await injectJson<{ items: { name: string }[] }>(server(), { method: "GET", url: "/events?station-run=v9", headers: authHeaders() });
    const matchedEvents = response.result.items;

    expect(matchedEvents.map((event) => event.name)).toEqual(["station_run.reported"]);
  });

  it("combines run and name filters", async () => {
    const runId = "00000000-0000-4000-8000-000000000002";
    await enqueueDispatch([]);
    await injectJson(server(), { method: "POST", url: "/events", headers: authHeaders(), payload: { name: "manual.tick", payload: {} } });

    const response = await injectJson<{ items: { name: string }[] }>(server(), { method: "GET", url: `/events?run=${runId}&name=manual.tick`, headers: authHeaders() });

    expect(response.result.items).toEqual([]);
  });

  it("caps the limit at 200", async () => {
    await pool().query(`insert into events (name, payload) select 'node.review.start', '{}'::jsonb from generate_series(1, 201)`);

    const response = await injectJson<{ items: unknown[] }>(server(), { method: "GET", url: "/events?since=0&limit=9999", headers: authHeaders() });

    expect(response.result.items).toHaveLength(200);
  });
});

describe("POST /events/claim", () => {
  it("returns a dispatch event whose tags the caller offers", async () => {
    await enqueueDispatch(["kind:agent"]);

    const response = await injectJson<{ name: string }[]>(server(), { method: "POST", url: "/events/claim", headers: authHeaders(), payload: { tags: ["kind:agent"], limit: 10 } });

    expect(response.result.map((event) => event.name)).toEqual(["station_run.dispatch"]);
  });

  it("returns 204 when nothing matches", async () => {
    const response = await injectJson(server(), { method: "POST", url: "/events/claim", headers: authHeaders(), payload: { tags: ["kind:service"], limit: 10 } });

    expect(response.statusCode).toBe(204);
  });

  it("does not return an unrelated event name", async () => {
    await injectJson(server(), { method: "POST", url: "/events", headers: authHeaders(), payload: { name: "manual.tick", payload: {} } });

    const response = await injectJson(server(), { method: "POST", url: "/events/claim", headers: authHeaders(), payload: { tags: [], limit: 10 } });

    expect(response.statusCode).toBe(204);
  });
});

describe("POST /events/:id/ack", () => {
  it("acks the claimed event", async () => {
    const id = await enqueueDispatch([]);
    await injectJson(server(), { method: "POST", url: "/events/claim", headers: authHeaders(), payload: { tags: [], limit: 10 } });

    const response = await injectJson(server(), { method: "POST", url: `/events/${id}/ack`, headers: authHeaders() });

    expect(response.statusCode).toBe(204);
  });
});

describe("POST /events/:id/fail", () => {
  it("requeues on a non-permanent failure", async () => {
    const id = await enqueueDispatch([]);

    const response = await injectJson(server(), { method: "POST", url: `/events/${id}/fail`, headers: authHeaders(), payload: { error: "boom", permanent: false } });
    const event = await injectJson<{ deadAt: string | null }>(server(), { method: "GET", url: `/events/${id}`, headers: authHeaders() });

    expect({ statusCode: response.statusCode, deadAt: event.result.deadAt }).toEqual({ statusCode: 204, deadAt: null });
  });

  it("dead-letters immediately when told the failure is permanent", async () => {
    const id = await enqueueDispatch([]);

    await injectJson(server(), { method: "POST", url: `/events/${id}/fail`, headers: authHeaders(), payload: { error: "boom", permanent: true } });
    const event = await injectJson<{ deadAt: string | null }>(server(), { method: "GET", url: `/events/${id}`, headers: authHeaders() });

    expect(event.result.deadAt).not.toBeNull();
  });
});

describe("visit-token-restricted posts", () => {
  it("refuses an unknown bearer token", async () => {
    const response = await injectJson(server(), { method: "POST", url: "/events", headers: { authorization: "Bearer not-a-real-token" }, payload: { name: "manual.tick", payload: {} } });

    expect(response.statusCode).toBe(401);
  });

  function visitAuth(visitId: string): Record<string, string> {
    const token = mintVisitToken(visitId, FUTURE_DEADLINE, VISIT_TOKEN_SECRET);

    return { authorization: `Bearer ${token}` };
  }

  it("lets a visit token post station_run.reported for its own visit", async () => {
    const response = await injectJson(server(), {
      method: "POST",
      url: "/events",
      headers: visitAuth("visit-1"),
      payload: { name: "station_run.reported", payload: { visitId: "visit-1" } },
    });

    expect(response.statusCode).toBe(201);
  });

  it("refuses a visit token posting for a different visit", async () => {
    const response = await injectJson(server(), {
      method: "POST",
      url: "/events",
      headers: visitAuth("visit-1"),
      payload: { name: "station_run.reported", payload: { visitId: "visit-2" } },
    });

    expect(response.statusCode).toBe(403);
  });

  it("refuses a visit token posting any other event name", async () => {
    const response = await injectJson(server(), {
      method: "POST",
      url: "/events",
      headers: visitAuth("visit-1"),
      payload: { name: "manual.tick", payload: {} },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("POST /events with station_run.reported", () => {
  it("stamps the run of the visit it reports on, so the report shows in that run's events", async () => {
    await deps().definitions.put("line", "line", { entry: "wait", exit: "done", args: {}, nodes: [{ id: "wait", station: "wait" }, { id: "done" }], edges: [] });
    await deps().definitions.put("station", "wait", { kind: "human", outcomes: ["success"], needs: [], produces: [] });
    const { run } = await deps().runs.start({ lineId: "line", repo: "r", startItems: {} });
    const { visit } = await deps().runs.openVisit(run.id, "wait", 1);

    const response = await injectJson<{ runId: string }>(server(), {
      method: "POST",
      url: "/events",
      headers: authHeaders(),
      payload: { name: "station_run.reported", payload: { visitId: visit.id, report: { outcome: "success" } } },
    });

    expect(response.result.runId).toBe(run.id);
  });
});
