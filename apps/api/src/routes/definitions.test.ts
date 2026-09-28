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

describe("POST /agent-definitions", () => {
  const SETTINGS = { prompt: "p", image: "img:1", timeoutMinutes: 5 };

  async function putWithConfig(config: Record<string, unknown>) {
    return injectJson<{ errors?: string[] }>(server(), { method: "POST", url: "/agent-definitions", headers: authHeaders(), payload: { id: "reviewer", settings: { ...SETTINGS, config } } });
  }

  it("takes an MCP server reached by url", async () => {
    const response = await putWithConfig({ mcp_servers: [{ name: "lore", transport: "http", url: "http://gateway.test/mcp", headers_secret: "lore-mcp-auth" }] });

    expect(response.statusCode).toBe(201);
  });

  it("takes an MCP server the pod starts as a process", async () => {
    const response = await putWithConfig({ mcp_servers: [{ name: "files", transport: "stdio", command: "npx", args: ["-y", "server-filesystem"] }] });

    expect(response.statusCode).toBe(201);
  });

  it("refuses an http MCP server with no url, naming it", async () => {
    const response = await putWithConfig({ mcp_servers: [{ name: "lore", transport: "http" }] });

    expect(response.result.errors).toEqual(["settings.config.mcp_servers.0: a stdio server needs a command, any other a url"]);
  });

  it("refuses a permission mode the subsystem does not have", async () => {
    const response = await putWithConfig({ permission_mode: "yolo" });

    expect(response.statusCode).toBe(400);
  });

  it("keeps a config key it has no use for", async () => {
    const response = await putWithConfig({ pod_resources: { memory: "2Gi" } });

    expect(response.statusCode).toBe(201);
  });
});

