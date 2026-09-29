import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PgPool } from "./pg.js";
import { openTestPool } from "./test-database.js";
import { AssemblyRunStore } from "./assembly-run-store.js";
import { CostsStore } from "./costs.js";
import { DefinitionsStore } from "./definitions.js";
import { RecordsStore } from "./records.js";
import type { LineBody, StationBody } from "./types.js";

let pool: PgPool;

beforeAll(async () => {
  pool = await openTestPool();
});

beforeEach(async () => {
  await pool.query("truncate definitions, assembly_runs, station_runs, station_run_records, events, blobs restart identity cascade");
});

afterAll(async () => {
  await pool.end();
});

async function seedAgentLine(lineId: string, model: string): Promise<void> {
  const stationId = agentStationId(lineId);
  const agentDefinitionId = `${lineId}-agent`;
  const line: LineBody = {
    entry: "review",
    exit: "done",
    args: {},
    nodes: [{ id: "review", station: stationId }, { id: "done" }],
    edges: [{ from: "review", to: "done", on: "success" }],
  };
  const station: StationBody = { kind: "agent", agentDefinition: agentDefinitionId, outcomes: ["success"], needs: [], produces: [] };

  await definitions().put("line", lineId, line);
  await definitions().put("station", stationId, station);
  await definitions().put("agent_definition", agentDefinitionId, { settings: { model, prompt: "p", image: "img:1", timeoutMinutes: 20 } });
}

function agentStationId(lineId: string): string {
  return `${lineId}-station`;
}

async function seedHumanLine(): Promise<void> {
  const line: LineBody = {
    entry: "approve",
    exit: "done",
    args: {},
    nodes: [{ id: "approve", station: "approve" }, { id: "done" }],
    edges: [{ from: "approve", to: "done", on: "success" }],
  };
  const station: StationBody = { kind: "human", outcomes: ["success"], needs: [], produces: [] };

  await definitions().put("line", "human-line", line);
  await definitions().put("station", "approve", station);
}

async function openAgentVisit(lineId: string, repo: string, moment: Date): Promise<string> {
  const { run } = await runs().start({ lineId, repo, startItems: {} });
  const { visit } = await runs().openVisit(run.id, "review", 1);

  await setOpenedAt(visit.id, moment);
  await runs().report(visit.id, { outcome: "success" });

  return visit.id;
}

async function openHumanVisit(repo: string, moment: Date): Promise<string> {
  const { run } = await runs().start({ lineId: "human-line", repo, startItems: {} });
  const { visit } = await runs().openVisit(run.id, "approve", 1);

  await setOpenedAt(visit.id, moment);
  await runs().report(visit.id, { outcome: "success" });

  return visit.id;
}

async function runOf(visitId: string): Promise<string> {
  const visit = await runs().visit(visitId);

  return visit!.runId;
}

async function setOpenedAt(visitId: string, moment: Date): Promise<void> {
  await pool.query("update station_runs set opened_at = $2 where station_run_id = $1", [visitId, moment]);
}

interface CostTokens {
  tokensIn: number;
  tokensOut: number;
}

async function recordCost(visitId: string, costUsd: number, moment: Date, tokens: CostTokens = { tokensIn: 0, tokensOut: 0 }): Promise<void> {
  const usage = { input_tokens: tokens.tokensIn, output_tokens: tokens.tokensOut };

  await records().append(visitId, [{ kind: "llm_call", body: { costUsd, usage }, occurredAt: moment }]);
}

function runs(): AssemblyRunStore {
  return new AssemblyRunStore({ pool });
}

function definitions(): DefinitionsStore {
  return new DefinitionsStore({ connection: pool });
}

function records(): RecordsStore {
  return new RecordsStore({ pool });
}

function costs(): CostsStore {
  return new CostsStore({ connection: pool });
}

const DAY_1 = new Date("2026-01-01T00:00:00Z");
const DAY_2 = new Date("2026-01-02T00:00:00Z");

async function twoLinesWithCost(model = "claude-x"): Promise<void> {
  await seedAgentLine("line-a", model);
  await seedAgentLine("line-b", model);
  await recordCost(await openAgentVisit("line-a", "r", DAY_1), 1, DAY_1);
  await recordCost(await openAgentVisit("line-b", "r", DAY_1), 2, DAY_1);
}

describe("CostsStore.summary", () => {
  it("groups by day", async () => {
    await seedAgentLine("code-review", "claude-x");
    await recordCost(await openAgentVisit("code-review", "r", DAY_1), 1, DAY_1);
    await recordCost(await openAgentVisit("code-review", "r", DAY_2), 2, DAY_2);

    const rows = await costs().summary({ repo: "r" }, "day");

    expect(rows.map((row) => ({ key: row.key, costUsd: row.costUsd }))).toEqual([
      { key: "2026-01-01", costUsd: 1 },
      { key: "2026-01-02", costUsd: 2 },
    ]);
  });

  it("groups by line", async () => {
    await twoLinesWithCost();

    const rows = await costs().summary({ repo: "r" }, "line");

    expect(rows.map((row) => ({ key: row.key, costUsd: row.costUsd }))).toEqual([
      { key: "line-a", costUsd: 1 },
      { key: "line-b", costUsd: 2 },
    ]);
  });

  it("groups by station", async () => {
    await twoLinesWithCost();

    const rows = await costs().summary({ repo: "r" }, "station");

    expect(rows.map((row) => row.key)).toEqual(["line-a-station", "line-b-station"]);
  });

  it("groups by model", async () => {
    await seedAgentLine("line-a", "claude-x");
    await seedAgentLine("line-b", "claude-y");
    await recordCost(await openAgentVisit("line-a", "r", DAY_1), 1, DAY_1);
    await recordCost(await openAgentVisit("line-b", "r", DAY_1), 2, DAY_1);

    const rows = await costs().summary({ repo: "r" }, "model");

    expect(rows.map((row) => ({ key: row.key, costUsd: row.costUsd }))).toEqual([
      { key: "claude-x", costUsd: 1 },
      { key: "claude-y", costUsd: 2 },
    ]);
  });

  it("sums tokens in and out from usage", async () => {
    await seedAgentLine("code-review", "claude-x");
    await recordCost(await openAgentVisit("code-review", "r", DAY_1), 1, DAY_1, { tokensIn: 100, tokensOut: 50 });

    const rows = await costs().summary({ repo: "r" }, "line");
    const row = rows[0]!;

    expect({ tokensIn: row.tokensIn, tokensOut: row.tokensOut }).toEqual({ tokensIn: 100, tokensOut: 50 });
  });

  it("counts what the model read from and wrote to its cache as tokens in", async () => {
    await seedAgentLine("code-review", "claude-x");
    const visitId = await openAgentVisit("code-review", "r", DAY_1);
    const usage = { input_tokens: 10, cache_creation_input_tokens: 200, cache_read_input_tokens: 3000, output_tokens: 50 };

    await records().append(visitId, [{ kind: "llm_call", body: { costUsd: 1, usage }, occurredAt: DAY_1 }]);
    const rows = await costs().summary({ repo: "r" }, "line");

    expect(rows[0]!.tokensIn).toBe(3210);
  });

  it("filters by repo", async () => {
    await seedAgentLine("code-review", "claude-x");
    await recordCost(await openAgentVisit("code-review", "repo-a", DAY_1), 1, DAY_1);
    await recordCost(await openAgentVisit("code-review", "repo-b", DAY_1), 2, DAY_1);

    const rows = await costs().summary({ repo: "repo-a" }, "line");

    expect(rows.map((row) => row.costUsd)).toEqual([1]);
  });

  it("filters by lineId", async () => {
    await twoLinesWithCost();

    const rows = await costs().summary({ lineId: "line-a" }, "line");

    expect(rows.map((row) => row.key)).toEqual(["line-a"]);
  });

  it("filters by station", async () => {
    await twoLinesWithCost();

    const rows = await costs().summary({ station: agentStationId("line-a") }, "line");

    expect(rows.map((row) => row.key)).toEqual(["line-a"]);
  });

  it("filters by since and until", async () => {
    await seedAgentLine("code-review", "claude-x");
    const early = new Date("2026-01-01T00:00:00Z");
    const late = new Date("2026-01-05T00:00:00Z");

    await recordCost(await openAgentVisit("code-review", "r", early), 1, early);
    await recordCost(await openAgentVisit("code-review", "r", late), 2, late);

    const rows = await costs().summary({ repo: "r", since: new Date("2026-01-02T00:00:00Z"), until: new Date("2026-01-06T00:00:00Z") }, "line");

    expect(rows.map((row) => row.costUsd)).toEqual([2]);
  });

  it("filters by run: what one run cost, and no other", async () => {
    await seedAgentLine("code-review", "claude-x");
    const asked = await openAgentVisit("code-review", "r", DAY_1);

    await recordCost(asked, 1, DAY_1);
    await recordCost(await openAgentVisit("code-review", "r", DAY_1), 2, DAY_1);
    const rows = await costs().summary({ runId: await runOf(asked) }, "line");

    expect(rows).toMatchObject([{ key: "code-review", costUsd: 1, visits: 1 }]);
  });

  it("groups by run", async () => {
    await seedAgentLine("code-review", "claude-x");
    const first = await openAgentVisit("code-review", "r", DAY_1);

    await recordCost(first, 1, DAY_1);
    await recordCost(await openAgentVisit("code-review", "r", DAY_1), 2, DAY_1);
    const rows = await costs().summary({ repo: "r" }, "run");

    expect(rows).toContainEqual(expect.objectContaining({ key: await runOf(first), costUsd: 1 }));
  });

  it("sums 0.4727074999999999 and 0.1 to 0.572707, and not to the noise a machine adds", async () => {
    await seedAgentLine("code-review", "claude-x");
    await recordCost(await openAgentVisit("code-review", "r", DAY_1), 0.4727074999999999, DAY_1);
    await recordCost(await openAgentVisit("code-review", "r", DAY_1), 0.1, DAY_1);
    const [row] = await costs().summary({ repo: "r" }, "line");

    expect(row!.costUsd).toBe(0.572707);
  });

  it("counts a visit with no llm_call record as missing", async () => {
    await seedAgentLine("code-review", "claude-x");
    await openAgentVisit("code-review", "r", DAY_1);

    const rows = await costs().summary({ repo: "r" }, "line");

    expect(rows[0]!.visitsMissingCost).toBe(1);
  });

  it("never counts a human visit as missing", async () => {
    await seedHumanLine();
    await openHumanVisit("r", DAY_1);

    const rows = await costs().summary({ repo: "r" }, "line");

    expect(rows[0]!.visitsMissingCost).toBe(0);
  });

  it("says what one run cost through ofRun, key and all", async () => {
    await seedAgentLine("code-review", "claude-x");
    const visitId = await openAgentVisit("code-review", "r", DAY_1);

    await recordCost(visitId, 2, DAY_1, { tokensIn: 5, tokensOut: 7 });

    expect(await costs().ofRun(await runOf(visitId))).toEqual({
      key: await runOf(visitId),
      costUsd: 2,
      tokensIn: 5,
      tokensOut: 7,
      visits: 1,
      visitsMissingCost: 0,
      unpriced: [],
    });
  });

  it("says null through ofRun for a run nothing was counted for", async () => {
    await seedAgentLine("code-review", "claude-x");
    const visitId = await openAgentVisit("code-review", "r", DAY_1);

    expect(await costs().ofRun(await runOf(visitId))).toBeNull();
  });
});
