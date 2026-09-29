import { describe, expect, it } from "vitest";
import type { LineBody, StationBody } from "@floor/store";
import { authHeaders, injectJson, setupTestServer } from "../test-server.js";

const { server, deps, loop } = setupTestServer();

const JUDGE_LINE: LineBody = {
  entry: "judge",
  exit: "done",
  args: {},
  nodes: [{ id: "judge", station: "judge" }, { id: "done" }],
  edges: [
    { from: "judge", to: "done", on: "success" },
    { from: "judge", to: "done", on: "changes_requested" },
  ],
};

const JUDGE: StationBody = {
  kind: "agent",
  agentDefinition: "gemini-judge",
  outcomes: ["success", "changes_requested"],
  needs: [],
  produces: [{ name: "judge_output", kind: "file", from: "output" }],
};

const PRICES = { "gemini-3.1-pro-preview": { inputPerMillion: 2, outputPerMillion: 12, cacheReadPerMillion: 0.2 } };
const GEMINI = { settings: { model: "gemini-3.1-pro-preview", prompt: "Judge it.", image: "img:1", timeoutMinutes: 20, prices: PRICES } };

const SPOKEN = [
  { type: "init", model: "gemini-3.1-pro-preview" },
  { type: "message", role: "user", content: "Judge it." },
  { type: "message", role: "assistant", content: "One defect.\n", delta: true },
  { type: "tool_use", tool_name: "read_file", parameters: { file_path: "/workspace/a.ts" } },
  { type: "message", role: "assistant", content: "REVIEW_RESULT:CHANGES_REQUESTED:guard the null", delta: true },
  {
    type: "result",
    status: "success",
    stats: {
      input: 700_000,
      cached: 300_000,
      output_tokens: 210_000,
      duration_ms: 9000,
      models: { "gemini-3.1-pro-preview": { input: 600_000, cached: 300_000, output_tokens: 200_000 }, "gemini-3-flash-preview": { input: 100_000, cached: 0, output_tokens: 10_000 } },
    },
  },
  { kind: "lifecycle", phase: "agent", status: "succeeded", exitCode: 0 },
];

async function geminiJudged() {
  const { definitions, runs } = deps();

  await Promise.all([definitions.put("line", "judge", JUDGE_LINE), definitions.put("station", "judge", JUDGE), definitions.put("agent_definition", "gemini-judge", GEMINI)]);
  const { run } = await runs.start({ lineId: "judge", repo: "r", startItems: {} });

  await loop().pass();
  const [visit] = await runs.visits(run.id);

  for (const event of SPOKEN) await injectJson(server(), { method: "POST", url: `/station-runs/${visit!.id}/sink`, headers: authHeaders(), payload: { source: { agent: "a" }, event } });
  await loop().pass();

  return { judged: await runs.visit(visit!.id), bag: await runs.bag(run.id), visitId: visit!.id };
}

describe("POST /station-runs/:id/sink, from a Gemini agent", () => {
  it("reports the outcome Gemini said in its messages, its last line carrying no words", async () => {
    const { judged } = await geminiJudged();

    expect(judged?.report).toMatchObject({ outcome: "changes_requested" });
  });

  it("hands on what Gemini said, put together from its pieces, as the file the station declares from its output", async () => {
    const { bag } = await geminiJudged();
    const said = await deps().blobs.get(bag.judge_output.ref);

    expect(said!.bytes.toString()).toBe("One defect.\nREVIEW_RESULT:CHANGES_REQUESTED:guard the null");
  });

  it("keeps what Gemini read and wrote, under the names costs are read by", async () => {
    const { visitId } = await geminiJudged();
    const cost = await deps().records.latest(visitId, "llm_call");

    expect(cost!.body).toMatchObject({
      durationMs: 9000,
      usage: { input_tokens: 700_000, cache_read_input_tokens: 300_000, output_tokens: 210_000 },
      models: { "gemini-3-flash-preview": { input_tokens: 100_000, cache_read_input_tokens: 0, output_tokens: 10_000 } },
    });
  });

  it("prices what Gemini counted at what the agent definition states: $3.66, and names the model it states no price for", async () => {
    const { visitId } = await geminiJudged();
    const cost = await deps().records.latest(visitId, "llm_call");

    expect(cost!.body).toMatchObject({ costUsd: 3.66, unpriced: ["gemini-3-flash-preview"] });
  });
});
