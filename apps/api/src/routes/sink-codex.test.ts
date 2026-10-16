import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LineBody, StationBody } from "@floor/store";
import { authHeaders, injectJson, setupTestServer } from "../test-server.js";

const { server, deps, loop } = setupTestServer();

const ANSWER_LINE: LineBody = {
  entry: "answer",
  exit: "done",
  args: {},
  nodes: [{ id: "answer", station: "answer" }, { id: "done" }],
  edges: [{ from: "answer", to: "done", on: "success" }],
};

const ANSWER: StationBody = {
  kind: "agent",
  agentDefinition: "codex-answer",
  outcomes: ["success"],
  needs: [],
  produces: [{ name: "answer_output", kind: "file", from: "output" }],
};

const PRICES = { "gpt-5.4": { inputPerMillion: 2.5, outputPerMillion: 15, cacheReadPerMillion: 0.25 } };
const CODEX = { settings: { model: "gpt-5.4", prompt: "Answer it.", image: "img:1", timeoutMinutes: 20, prices: PRICES } };

async function codexRan(fixture: string, ended: unknown) {
  const { definitions, runs } = deps();

  await Promise.all([definitions.put("line", "answer", ANSWER_LINE), definitions.put("station", "answer", ANSWER), definitions.put("agent_definition", "codex-answer", CODEX)]);
  const { run } = await runs.start({ lineId: "answer", repo: "r", startItems: {} });

  await loop().pass();
  const [visit] = await runs.visits(run.id);

  for (const event of [...streamOf(fixture), ended]) await injectJson(server(), { method: "POST", url: `/station-runs/${visit!.id}/sink`, headers: authHeaders(), payload: { source: { agent: "a" }, event } });
  await loop().pass();

  return { answered: await runs.visit(visit!.id), bag: await runs.bag(run.id), visitId: visit!.id };
}

function streamOf(fixture: string): unknown[] {
  const lines = readFileSync(new URL(`testdata/${fixture}`, import.meta.url), "utf8").split("\n").filter(Boolean);

  return lines.map((line) => JSON.parse(line) as unknown);
}

const succeeded = () => codexRan("codex-cli.jsonl", { kind: "lifecycle", phase: "agent", status: "succeeded", exitCode: 0 });
const failed = () => codexRan("codex-cli-error.jsonl", { kind: "lifecycle", phase: "agent", status: "failed", exitCode: 1 });

describe("POST /station-runs/:id/sink, from a Codex agent", () => {
  it("hands on the message Codex completed, its last line carrying no words, as the file the station declares from its output", async () => {
    const { answered, bag } = await succeeded();
    const said = await deps().blobs.get(bag.answer_output.ref);

    expect({ outcome: answered?.report?.outcome, said: said!.bytes.toString() }).toEqual({ outcome: "success", said: "ok" });
  });

  it("prices what Codex counted at what the agent definition states: 1342 input, 6400 cached and 5 written come to $0.00503", async () => {
    const { visitId } = await succeeded();
    const cost = await deps().records.latest(visitId, "llm_call");

    expect(cost!.body).toMatchObject({
      costUsd: 0.00503,
      usage: { input_tokens: 1342, cache_read_input_tokens: 6400, output_tokens: 5 },
      models: { "gpt-5.4": { input_tokens: 1342, cache_read_input_tokens: 6400, output_tokens: 5, cost_usd: 0.00503 } },
    });
  });

  it("fails the visit with the reason Codex's turn.failed gave, not the exit code", async () => {
    const { answered } = await failed();

    expect(answered?.report).toMatchObject({ outcome: "failed", error: expect.stringMatching(/^unexpected status 401 Unauthorized: Incorrect API key provided/) });
  });
});
