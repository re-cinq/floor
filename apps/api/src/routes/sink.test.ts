import { describe, expect, it } from "vitest";
import type { LineBody, StationBody } from "@floor/store";
import { authHeaders, injectJson, setupTestServer } from "../test-server.js";

const { server, deps, loop } = setupTestServer();

const REVIEW_LINE: LineBody = {
  entry: "review",
  exit: "done",
  args: { pr_url: { kind: "value", subject: true } },
  nodes: [{ id: "review", station: "review" }, { id: "done" }],
  edges: [
    { from: "review", to: "done", on: "success" },
    { from: "review", to: "review", on: "changes_requested", iterationMax: 2 },
  ],
};

const REVIEW_STATION: StationBody = {
  kind: "agent",
  agentDefinition: "reviewer",
  conversation: "continue",
  outcomes: ["success", "changes_requested"],
  needs: [{ name: "pr_url", kind: "value" }],
  produces: [
    { name: "review_verdict", kind: "value" },
    { name: "review_findings", kind: "file", path: "findings.md" },
    { name: "review_output", kind: "file", from: "output" },
  ],
};

const LORE_MCP = { name: "lore", transport: "http", url: "http://gateway.test/mcp", headers_secret: "lore-mcp-auth" };

const REVIEWER = {
  settings: { model: "claude-sonnet-5", prompt: "Review {pr_url}.", image: "img:1", timeoutMinutes: 20, config: { skills: ["review"], disallowed_tools: ["Bash(npm:*)"], env: { LOG: "1" }, permission_mode: "auto", max_turns: 12, pod_resources: { requests: { cpu: "250m", memory: "512Mi" }, limits: { memory: "1Gi" } }, skills_source: "http://registry.test/skills", mcp_servers: [LORE_MCP] } },
};

interface Brief {
  visitId: string;
  token: string;
  deadlineMinutes: number;
  settings: Record<string, unknown>;
  needs: unknown[];
  conversation: { mode: string; sessionRef?: string; save?: boolean };
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function reviewDispatched(): Promise<{ runId: string; brief: Brief }> {
  await deps().definitions.put("line", "review", REVIEW_LINE);
  await deps().definitions.put("station", "review", REVIEW_STATION);
  await deps().definitions.put("agent_definition", "reviewer", REVIEWER);
  const { run } = await deps().runs.start({ lineId: "review", repo: "r", startItems: { pr_url: { kind: "value", ref: "https://pr/412", by: "start" } } });

  await loop().pass();

  return { runId: run.id, brief: await briefOfOpenVisit(run.id) };
}

async function briefOfOpenVisit(runId: string): Promise<Brief> {
  const visits = await deps().runs.visits(runId);
  const open = visits.find((visit) => !visit.report);
  const response = await injectJson<Brief>(server(), { method: "GET", url: `/station-runs/${open!.id}/brief`, headers: authHeaders() });

  return response.result;
}

async function post(brief: Brief, event: unknown): Promise<number> {
  const response = await injectJson(server(), { method: "POST", url: `/station-runs/${brief.visitId}/sink`, headers: bearer(brief.token), payload: { source: { agent: "a" }, event } });

  return response.statusCode;
}

async function agentRan(brief: Brief, resultText: string): Promise<void> {
  const findings = await upload(brief, "/blobs", "# findings");

  await post(brief, { type: "assistant", message: { content: "looking" } });
  await post(brief, { type: "result", result: resultText, is_error: false, total_cost_usd: 0.42, num_turns: 3 });
  await post(brief, { kind: "file", event: "produced.review_findings", path: "/w/findings.md", uploaded: true, sha256: findings.slice("sha256-".length) });
  await upload(brief, `/conversations/${brief.visitId}`, "archive-of-round-one");
  await post(brief, { kind: "lifecycle", phase: "agent", status: "succeeded", exitCode: 0 });
  await loop().pass();
}

async function upload(brief: Brief, url: string, bytes: string): Promise<string> {
  const response = await injectJson<{ hash: string }>(server(), { method: "POST", url, headers: bearer(brief.token), payload: Buffer.from(bytes) });

  return response.result.hash;
}

async function reviewApproved() {
  const { runId, brief } = await reviewDispatched();

  await agentRan(brief, 'Looks good.\nLORE_NODE_RESULT: {"outcome":"success","produced":{"review_verdict":"approved","stray":"x"}}');
  const bag = await deps().runs.bag(runId);
  const visit = await deps().runs.visit(brief.visitId);

  return { runId, brief, run: await deps().runs.get(runId), bag, visit };
}

describe("GET /station-runs/:id/brief", () => {
  it("gives the executor the visit's needs and settings, structured", async () => {
    const { brief } = await reviewDispatched();

    expect(brief).toMatchObject({
      deadlineMinutes: 50,
      settings: { model: "claude-sonnet-5", prompt: "Review {pr_url}.", image: "img:1", skills: ["review"], disallowedTools: ["Bash(npm:*)"], env: { LOG: "1" }, permissionMode: "auto", maxTurns: 12 },
      needs: [{ name: "pr_url", kind: "value", value: "https://pr/412" }],
      conversation: { mode: "new", save: true },
    });
  });

  it("names the run the visit belongs to and its assembly line", async () => {
    const { runId, brief } = await reviewDispatched();

    expect(brief).toMatchObject({ runId, lineId: "review" });
  });

  it("names the node of the line the visit is a pass at", async () => {
    const { brief } = await reviewDispatched();

    expect(brief).toMatchObject({ nodeId: "review" });
  });

  it("passes the definition's MCP servers and skill registry to the executor", async () => {
    const { brief } = await reviewDispatched();

    expect(brief.settings).toMatchObject({
      skillsSource: "http://registry.test/skills",
      mcpServers: [{ name: "lore", transport: "http", url: "http://gateway.test/mcp", headersSecret: "lore-mcp-auth" }],
    });
  });

  it("carries the definition's pod resources into the brief", async () => {
    const { brief } = await reviewDispatched();

    expect(brief.settings).toMatchObject({ podResources: { requests: { cpu: "250m", memory: "512Mi" }, limits: { memory: "1Gi" } } });
  });

  it("mints a token that reaches the visit's own sink", async () => {
    const { brief } = await reviewDispatched();

    expect(await post(brief, { type: "assistant" })).toBe(204);
  });

  it("returns 404 for a visit that does not exist", async () => {
    const response = await injectJson(server(), { method: "GET", url: "/station-runs/0b0e7d3c-6f1a-4a52-9d3e-2f6f1c1e9a01/brief", headers: authHeaders() });

    expect(response.statusCode).toBe(404);
  });

  it("returns 409 once the visit is done", async () => {
    const { brief } = await reviewApproved();
    const response = await injectJson(server(), { method: "GET", url: `/station-runs/${brief.visitId}/brief`, headers: authHeaders() });

    expect(response.statusCode).toBe(409);
  });
});

describe("POST /station-runs/:id/sink", () => {
  it("settles the run on the outcome the agent printed", async () => {
    const { run } = await reviewApproved();

    expect(run!.outcome).toBe("success");
  });

  it("puts what the station declares into the bag, and nothing else the agent claimed", async () => {
    const { bag, brief } = await reviewApproved();

    expect(bag).toMatchObject({
      review_verdict: { kind: "value", ref: "approved", by: brief.visitId },
      review_findings: { kind: "file", ref: expect.stringMatching(/^sha256-[0-9a-f]{64}$/) },
    });
  });

  it("hands on what the agent said last, whole, as a file the station declares from its output", async () => {
    const { bag } = await reviewApproved();
    const said = await deps().blobs.get(bag.review_output.ref);

    expect(said!.bytes.toString()).toContain("Looks good.\nLORE_NODE_RESULT:");
  });

  it("drops a produced name the station does not declare", async () => {
    const { bag } = await reviewApproved();

    expect(Object.keys(bag)).not.toContain("stray");
  });

  it("records where the conversation was saved on the visit's report", async () => {
    const { visit } = await reviewApproved();

    expect(visit!.report?.sessionRef).toMatch(/^sha256-[0-9a-f]{64}$/);
  });

  it("keeps the agent's turns as records", async () => {
    const { brief } = await reviewApproved();
    const turns = await deps().records.list(brief.visitId, "turn", { limit: 10 });

    expect(turns.items.map((record) => record.body)).toEqual([{ type: "assistant", message: { content: "looking" } }]);
  });

  it("keeps the cost of the run as an llm_call record", async () => {
    const { brief } = await reviewApproved();
    const cost = await deps().records.latest(brief.visitId, "llm_call");

    expect(cost!.body).toMatchObject({ costUsd: 0.42, turns: 3 });
  });

  it("reports once, though the supervisor posts the visit's end twice", async () => {
    const { brief } = await reviewDispatched();
    const ended = { kind: "lifecycle", phase: "agent", status: "succeeded", exitCode: 0 };

    await post(brief, ended);
    await post(brief, ended);
    const runEvents = await deps().events.listByRun((await deps().runs.visit(brief.visitId))!.runId);

    expect(runEvents.filter((event) => event.name === "station_run.reported")).toHaveLength(1);
  });

  it("fails the visit when the agent crashes, with the supervisor's reason", async () => {
    const { brief } = await reviewDispatched();

    await post(brief, { kind: "lifecycle", phase: "agent", status: "failed", exitCode: 137 });
    await loop().pass();
    const visit = await deps().runs.visit(brief.visitId);

    expect(visit!.report).toEqual({ outcome: "failed", error: "agent failed: exit code 137" });
  });

  it("fails the visit on an init failure, the agent never having started", async () => {
    const { brief } = await reviewDispatched();

    await post(brief, { kind: "lifecycle", phase: "init", status: "failed", tool: "files", exitCode: 1 });
    await loop().pass();
    const visit = await deps().runs.visit(brief.visitId);

    expect(visit!.report?.error).toBe("init failed: tool files, exit code 1");
  });

  it("fails the visit on a marker it cannot read, instead of passing it", async () => {
    const { brief } = await reviewDispatched();

    await agentRan(brief, "LORE_NODE_RESULT: approved");
    const visit = await deps().runs.visit(brief.visitId);

    expect(visit!.report).toMatchObject({ outcome: "failed", error: expect.stringContaining("unparseable LORE_NODE_RESULT") });
  });

  it("fails a visit whose agent ended without a word and without the file it was to produce, naming the file", async () => {
    const { brief } = await reviewDispatched();

    await post(brief, { type: "assistant", message: { content: "reading" } });
    await post(brief, { kind: "file", event: "produced.review_findings", path: "/w/findings.md", reason: "missing" });
    await post(brief, { kind: "lifecycle", phase: "agent", status: "succeeded", exitCode: 0 });
    await loop().pass();
    const visit = await deps().runs.visit(brief.visitId);

    expect(visit!.report).toEqual({ outcome: "failed", error: "the agent ended without a LORE_NODE_RESULT line and without producing review_findings (findings.md)" });
  });

  it("refuses an event for a visit already done", async () => {
    const { brief } = await reviewApproved();

    expect(await post(brief, { type: "assistant" })).toBe(409);
  });

  it("stolen token: a visit's token does not reach another visit's sink", async () => {
    const { brief } = await reviewDispatched();
    const response = await injectJson(server(), { method: "POST", url: "/station-runs/0b0e7d3c-6f1a-4a52-9d3e-2f6f1c1e9a01/sink", headers: bearer(brief.token), payload: {} });

    expect(response.statusCode).toBe(403);
  });

  it("forged upload: a file event naming a blob nobody stored produces nothing", async () => {
    const { runId, brief } = await reviewDispatched();

    await post(brief, { kind: "file", event: "produced.review_findings", uploaded: true, sha256: "b".repeat(64) });
    await post(brief, { kind: "lifecycle", phase: "agent", status: "succeeded", exitCode: 0 });
    await loop().pass();

    expect(Object.keys(await deps().runs.bag(runId))).not.toContain("review_findings");
  });
});

describe("conversations", () => {
  async function secondRound() {
    const { runId, brief: first } = await reviewDispatched();

    await agentRan(first, "LORE_NODE_RESULT: changes_requested");
    await loop().pass();

    return { first, second: await briefOfOpenVisit(runId) };
  }

  it("tells the next round's executor which visit's conversation to continue", async () => {
    const { first, second } = await secondRound();

    expect(second.conversation).toEqual({ mode: "continue", sessionRef: first.visitId });
  });

  it("restores the archive the earlier visit saved, for the visit that continues it", async () => {
    const { first, second } = await secondRound();
    const response = await injectJson(server(), { method: "GET", url: `/conversations/${first.visitId}`, headers: bearer(second.token) });

    expect(response.rawPayload.toString()).toBe("archive-of-round-one");
  });

  it("stolen token: a visit that does not continue the conversation cannot restore it", async () => {
    const { first } = await secondRound();
    const response = await injectJson(server(), { method: "GET", url: `/conversations/${first.visitId}`, headers: bearer(first.token) });

    expect(response.statusCode).toBe(403);
  });

  it("returns 404 for a visit that saved no conversation", async () => {
    const { brief } = await reviewDispatched();
    const response = await injectJson(server(), { method: "GET", url: `/conversations/${brief.visitId}`, headers: authHeaders() });

    expect(response.statusCode).toBe(404);
  });
});
