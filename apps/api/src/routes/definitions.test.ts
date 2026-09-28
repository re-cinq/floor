import { describe, expect, it } from "vitest";
import { authHeaders, injectJson, setupTestServer } from "../test-server.js";

const { server } = setupTestServer();

const STATION_BODY = {
  id: "review",
  kind: "agent",
  agentDefinition: "reviewer",
  outcomes: ["success"],
  needs: [],
  produces: [],
};

interface PutResult {
  hash: string;
  created: boolean;
}

interface DefinitionRow {
  body: { kind: string; outcomes: string[] };
}

describe("POST /stations", () => {
  it("creates a new version and returns its hash", async () => {
    const response = await injectJson<PutResult>(server(), { method: "POST", url: "/stations", headers: authHeaders(), payload: STATION_BODY });

    expect({ statusCode: response.statusCode, created: response.result.created }).toEqual({ statusCode: 201, created: true });
  });

  it("returns 400 with every validation error on a bad body", async () => {
    const response = await injectJson(server(), { method: "POST", url: "/stations", headers: authHeaders(), payload: { id: "review" } });

    expect(response.statusCode).toBe(400);
  });

  it("refuses a request with no bearer token", async () => {
    const response = await injectJson(server(), { method: "POST", url: "/stations", payload: STATION_BODY });

    expect(response.statusCode).toBe(401);
  });
});

describe("GET /stations/:id", () => {
  it("returns the latest version", async () => {
    await injectJson(server(), { method: "POST", url: "/stations", headers: authHeaders(), payload: STATION_BODY });

    const response = await injectJson<DefinitionRow>(server(), { method: "GET", url: "/stations/review", headers: authHeaders() });
    const body = response.result.body;

    expect(body.kind).toBe("agent");
  });

  it("returns 404 for an id never put", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/stations/missing", headers: authHeaders() });

    expect(response.statusCode).toBe(404);
  });
});

describe("GET /stations/:id/versions", () => {
  it("returns every version, newest first", async () => {
    await injectJson(server(), { method: "POST", url: "/stations", headers: authHeaders(), payload: STATION_BODY });
    await injectJson(server(), { method: "POST", url: "/stations", headers: authHeaders(), payload: { ...STATION_BODY, outcomes: ["success", "failed"] } });

    const response = await injectJson<{ items: unknown[] }>(server(), { method: "GET", url: "/stations/review/versions", headers: authHeaders() });

    expect(response.result.items).toHaveLength(2);
  });
});

describe("PUT /stations/:id", () => {
  it("creates a new version without changing the id", async () => {
    await injectJson(server(), { method: "POST", url: "/stations", headers: authHeaders(), payload: STATION_BODY });

    const { id, ...rest } = STATION_BODY;
    void id;
    await injectJson(server(), { method: "PUT", url: "/stations/review", headers: authHeaders(), payload: { ...rest, outcomes: ["success", "failed"] } });
    const latest = await injectJson<DefinitionRow>(server(), { method: "GET", url: "/stations/review", headers: authHeaders() });
    const body = latest.result.body;

    expect(body.outcomes).toEqual(["success", "failed"]);
  });
});

describe("DELETE /stations/:id", () => {
  it("archives the station so latest no longer finds it", async () => {
    await injectJson(server(), { method: "POST", url: "/stations", headers: authHeaders(), payload: STATION_BODY });

    await injectJson(server(), { method: "DELETE", url: "/stations/review", headers: authHeaders() });
    const response = await injectJson(server(), { method: "GET", url: "/stations/review", headers: authHeaders() });

    expect(response.statusCode).toBe(404);
  });
});

describe("DELETE /assembly-lines/:id", () => {
  const LINE_BODY = {
    id: "code-review",
    entry: "review",
    exit: "done",
    args: {},
    nodes: [{ id: "review" }, { id: "done" }],
    edges: [{ from: "review", to: "done", on: "success" }],
  };

  it("refuses to archive a line with an open run", async () => {
    await injectJson(server(), { method: "POST", url: "/assembly-lines", headers: authHeaders(), payload: LINE_BODY });
    await injectJson(server(), { method: "POST", url: "/assembly-lines/code-review/start", headers: authHeaders(), payload: { repo: "r", startItems: {} } });

    const response = await injectJson(server(), { method: "DELETE", url: "/assembly-lines/code-review", headers: authHeaders() });

    expect(response.statusCode).toBe(409);
  });
});
