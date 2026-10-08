import { FAN_STATIONS, fanLine } from "@floor/store";
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

const MARKER_LINE_BODY = {
  id: "code-review",
  entry: "review",
  exit: "done",
  args: {},
  nodes: [{ id: "review" }, { id: "done" }],
  edges: [{ from: "review", to: "done", on: "success" }],
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
  it("refuses to archive a line with an open run", async () => {
    await injectJson(server(), { method: "POST", url: "/assembly-lines", headers: authHeaders(), payload: MARKER_LINE_BODY });
    await injectJson(server(), { method: "POST", url: "/assembly-lines/code-review/start", headers: authHeaders(), payload: { repo: "r", startItems: {} } });

    const response = await injectJson(server(), { method: "DELETE", url: "/assembly-lines/code-review", headers: authHeaders() });

    expect(response.statusCode).toBe(409);
  });
});

describe("DELETE /agent-definitions/:id", () => {
  const AGENT_DEFINITION = { id: "reviewer", settings: { prompt: "p", image: "img:1", timeoutMinutes: 5 } };

  async function send(method: "POST" | "DELETE", url: string, payload?: object) {
    return injectJson<{ errors?: string[]; detail?: string }>(server(), { method, url, headers: authHeaders(), payload });
  }

  async function putAgentDefinitionAndStation(): Promise<void> {
    await send("POST", "/agent-definitions", AGENT_DEFINITION);
    await send("POST", "/stations", STATION_BODY);
  }

  it("answers 409 naming the station when a station's latest version names it", async () => {
    await putAgentDefinitionAndStation();

    const response = await send("DELETE", "/agent-definitions/reviewer");

    expect({ statusCode: response.statusCode, detail: response.result.detail }).toEqual({
      statusCode: 409,
      detail: `agent definition "reviewer" is named by station "review"`,
    });
  });

  it("answers 204 when the station named it only in an older version", async () => {
    await putAgentDefinitionAndStation();
    await send("POST", "/stations", { ...STATION_BODY, agentDefinition: "other-reviewer" });

    const response = await send("DELETE", "/agent-definitions/reviewer");

    expect(response.statusCode).toBe(204);
  });

  it("answers 204 when the station naming it is archived", async () => {
    await putAgentDefinitionAndStation();
    await send("DELETE", "/stations/review");

    const response = await send("DELETE", "/agent-definitions/reviewer");

    expect(response.statusCode).toBe(204);
  });

  it("answers 204 when no station names it", async () => {
    await send("POST", "/agent-definitions", AGENT_DEFINITION);

    const response = await send("DELETE", "/agent-definitions/reviewer");

    expect(response.statusCode).toBe(204);
  });
});

describe("POST /assembly-lines semantic validation", () => {
  const STATION_ID = "review";

  async function putStation(): Promise<void> {
    await injectJson(server(), { method: "POST", url: "/stations", headers: authHeaders(), payload: STATION_BODY });
  }

  function lineNaming(station: string): object {
    return {
      id: "code-review",
      entry: STATION_ID,
      exit: "done",
      args: {},
      nodes: [{ id: STATION_ID, station }, { id: "done" }],
      edges: [{ from: STATION_ID, to: "done", on: "success" }],
    };
  }

  it("returns 400 with every problem for a line naming an unknown station", async () => {
    const response = await injectJson<{ errors?: string[] }>(server(), { method: "POST", url: "/assembly-lines", headers: authHeaders(), payload: lineNaming("missing") });

    expect({ statusCode: response.statusCode, errors: response.result.errors }).toEqual({ statusCode: 400, errors: [`node "review" names unknown station "missing"`] });
  });

  it("accepts a line naming a station that was put first", async () => {
    await putStation();

    const response = await injectJson(server(), { method: "POST", url: "/assembly-lines", headers: authHeaders(), payload: lineNaming(STATION_ID) });

    expect(response.statusCode).toBe(201);
  });

  it("keeps the fail node a line was posted with", async () => {
    await injectJson(server(), { method: "POST", url: "/stations", headers: authHeaders(), payload: { ...STATION_BODY, outcomes: ["success", "failed"] } });
    const line = {
      ...lineNaming(STATION_ID),
      fail: "failed",
      nodes: [{ id: STATION_ID, station: STATION_ID }, { id: "done" }, { id: "failed" }],
      edges: [
        { from: STATION_ID, to: "done", on: "success" },
        { from: STATION_ID, to: "failed", on: "failed" },
      ],
    };

    const posted = await injectJson(server(), { method: "POST", url: "/assembly-lines", headers: authHeaders(), payload: line });
    const stored = await injectJson(server(), { method: "GET", url: "/assembly-lines/code-review", headers: authHeaders() });

    expect({ posted: posted.statusCode, stored: stored.result }).toMatchObject({ posted: 201, stored: { body: { fail: "failed" } } });
  });

  it("returns 400 with both a missing outcome edge and an unmet need", async () => {
    await injectJson(server(), {
      method: "POST",
      url: "/stations",
      headers: authHeaders(),
      payload: { id: STATION_ID, kind: "agent", agentDefinition: "reviewer", outcomes: ["success", "changes_requested"], needs: [{ name: "target", kind: "value" }], produces: [] },
    });

    const response = await injectJson<{ errors?: string[] }>(server(), { method: "POST", url: "/assembly-lines", headers: authHeaders(), payload: lineNaming(STATION_ID) });

    expect({ statusCode: response.statusCode, errors: response.result.errors }).toEqual({
      statusCode: 400,
      errors: [`node "review" has no edge for outcome "changes_requested"`, `node "review" needs "target", which is not seeded at start and not produced on every path into it`],
    });
  });

  it("PUT /assembly-lines/:id returns 400 with every problem", async () => {
    await injectJson(server(), { method: "POST", url: "/assembly-lines", headers: authHeaders(), payload: MARKER_LINE_BODY });
    const { id, ...rest } = MARKER_LINE_BODY;
    void id;
    const line = { ...rest, entry: "missing" };

    const response = await injectJson<{ errors?: string[] }>(server(), { method: "PUT", url: "/assembly-lines/code-review", headers: authHeaders(), payload: line });

    expect({ statusCode: response.statusCode, errors: response.result.errors }).toEqual({ statusCode: 400, errors: [`entry "missing" is not a node`] });
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

  it("takes pod resources with requests and limits as Kubernetes quantities", async () => {
    const response = await putWithConfig({ pod_resources: { requests: { cpu: "250m", memory: "512Mi" }, limits: { cpu: "1", memory: "1Gi" } } });

    expect(response.statusCode).toBe(201);
  });

  it("refuses a pod resource the pod has no use for, naming it", async () => {
    const response = await putWithConfig({ pod_resources: { requests: { gpu: "1" } } });

    expect(response).toMatchObject({ statusCode: 400, result: { errors: [expect.stringContaining("settings.config.pod_resources.requests")] } });
  });

  it.each(["", 2, "lots"])("refuses the pod resource value %j, which is not a quantity", async (value) => {
    const response = await putWithConfig({ pod_resources: { limits: { memory: value } } });

    expect(response).toMatchObject({ statusCode: 400, result: { errors: [expect.stringContaining("settings.config.pod_resources.limits.memory")] } });
  });

  it("refuses a pod resources key that is neither requests nor limits", async () => {
    const response = await putWithConfig({ pod_resources: { request: { cpu: "1" } } });

    expect(response.statusCode).toBe(400);
  });

  it("keeps a config key it has no use for", async () => {
    const response = await putWithConfig({ workdir: "/work" });

    expect(response.statusCode).toBe(201);
  });
});

describe("a fan-out line", () => {
  const stations = Object.entries(FAN_STATIONS).map(([id, body]) => ({ id, ...body }));
  const line = { id: "fan", ...fanLine() };

  async function putAll(): Promise<void> {
    for (const station of stations) await injectJson(server(), { method: "POST", url: "/stations", headers: authHeaders(), payload: station });
    await injectJson(server(), { method: "POST", url: "/assembly-lines", headers: authHeaders(), payload: line });
  }

  it("keeps the fan-out a node declares", async () => {
    await putAll();

    const response = await injectJson<{ body: { nodes: { fanout?: unknown }[] } }>(server(), { method: "GET", url: "/assembly-lines/fan", headers: authHeaders() });
    const { body } = response.result;
    const [source] = body.nodes;

    expect(source!.fanout).toEqual({ over: "items", to: "work" });
  });

  it("keeps the collect a need declares", async () => {
    await putAll();

    const response = await injectJson<{ body: { needs: { collect?: string }[] } }>(server(), { method: "GET", url: "/stations/merger", headers: authHeaders() });
    const { body } = response.result;
    const [need] = body.needs;

    expect(need!.collect).toBe("result");
  });

  it("refuses a fan-out whose body is not a node", async () => {
    await putAll();
    const broken = { ...line, id: "broken", nodes: [{ ...line.nodes[0]!, fanout: { over: "items", to: "nowhere" } }, ...line.nodes.slice(1)] };

    const response = await injectJson(server(), { method: "POST", url: "/assembly-lines", headers: authHeaders(), payload: broken });

    expect(response.statusCode).toBe(400);
  });
});
