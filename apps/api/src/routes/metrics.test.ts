import { describe, expect, it } from "vitest";
import { setupTestServer } from "../test-server.js";
import { SERVICE_STATION, WORK_LINE, tickDispatcherUntilIdle, workStarted } from "../test-fixtures.js";

const { server, deps } = setupTestServer();

async function settledRunId(): Promise<string> {
  await deps().definitions.put("station", "work", SERVICE_STATION);
  await deps().definitions.put("line", "line", WORK_LINE);
  const { run } = await deps().runs.start({ lineId: "line", repo: "r", startItems: {} });

  await tickDispatcherUntilIdle(deps());
  const [visit] = await deps().runs.visits(run.id);

  await deps().runs.report(visit!.id, { outcome: "success" });
  await tickDispatcherUntilIdle(deps());

  return run.id;
}

async function metricsText(): Promise<string> {
  const response = await server().inject({ method: "GET", url: "/metrics" });

  return response.payload;
}

async function backdateVisitDeadline(visitId: string, deadline: Date): Promise<void> {
  await deps().pool.query(`update station_runs set deadline = $1 where station_run_id = $2`, [deadline, visitId]);
}

function metricValue(text: string, metric: string): number {
  const line = text.split("\n").find((entry) => entry.startsWith(`${metric} `));

  return Number(line?.slice(metric.length + 1));
}

describe("GET /metrics", () => {
  it("is reachable with no bearer token", async () => {
    const response = await server().inject({ method: "GET", url: "/metrics" });

    expect(response.statusCode).toBe(200);
  });

  it("serves the Prometheus text exposition format as its content type", async () => {
    const response = await server().inject({ method: "GET", url: "/metrics" });

    expect(response.headers["content-type"]).toContain("text/plain");
  });

  it("counts one open run and one open visit once a run starts", async () => {
    await workStarted(deps());

    const text = await metricsText();

    expect({ runsOpen: metricValue(text, "floor_runs_open"), visitsOpen: metricValue(text, "floor_visits_open") }).toEqual({
      runsOpen: 1,
      visitsOpen: 1,
    });
  });

  it("moves a run from open to settled under its outcome label once its visit reports success", async () => {
    await settledRunId();

    const text = await metricsText();

    expect({
      runsOpen: metricValue(text, "floor_runs_open"),
      settledSuccess: metricValue(text, 'floor_runs_settled_total{outcome="success"}'),
    }).toEqual({ runsOpen: 0, settledSuccess: 1 });
  });

  it("counts an open visit whose deadline has passed as overdue", async () => {
    const { visitId } = await workStarted(deps());

    await backdateVisitDeadline(visitId, new Date("2025-01-01T00:00:00Z"));
    const text = await metricsText();

    expect(metricValue(text, "floor_visits_overdue")).toBe(1);
  });

  it("counts the settled run of line on repository r once, by line and by line and outcome, with its duration under +Inf", async () => {
    await settledRunId();

    const text = await metricsText();

    expect({
      started: metricValue(text, 'floor_runs_started_total{line_id="line",repo="r"}'),
      settled: metricValue(text, 'floor_runs_settled_by_line_total{line_id="line",outcome="success"}'),
      durationCount: metricValue(text, 'floor_run_duration_seconds_count{line_id="line",outcome="success"}'),
      lastBucket: metricValue(text, 'floor_run_duration_seconds_bucket{line_id="line",outcome="success",le="+Inf"}'),
    }).toEqual({ started: 1, settled: 1, durationCount: 1, lastBucket: 1 });
  });

  it("counts the one finished visit of station work with its duration, and no retry", async () => {
    await settledRunId();

    const text = await metricsText();

    expect({
      visits: metricValue(text, 'floor_visits_total{line_id="line",node_id="work",outcome="success"}'),
      durationCount: metricValue(text, 'floor_visit_duration_seconds_count{line_id="line",node_id="work",outcome="success"}'),
      retries: text.includes("floor_visit_retries_total{"),
    }).toEqual({ visits: 1, durationCount: 1, retries: false });
  });

  it("sums a 0.25 usd llm_call of 100 in and 20 out tokens under line, station work and model sonnet", async () => {
    const runId = await settledRunId();
    const [visit] = await deps().runs.visits(runId);
    const models = { sonnet: { cost_usd: 0.25, input_tokens: 100, output_tokens: 20 } };

    await deps().records.append(visit!.id, [{ kind: "llm_call", body: { costUsd: 0.25, models }, occurredAt: new Date("2026-10-09T10:00:00Z") }]);
    const text = await metricsText();

    expect({
      cost: metricValue(text, 'floor_cost_usd_total{line_id="line",node_id="work",model="sonnet"}'),
      tokensIn: metricValue(text, 'floor_tokens_total{line_id="line",node_id="work",model="sonnet",kind="in"}'),
      tokensOut: metricValue(text, 'floor_tokens_total{line_id="line",node_id="work",model="sonnet",kind="out"}'),
    }).toEqual({ cost: 0.25, tokensIn: 100, tokensOut: 20 });
  });

  it("reports the claim latency of the acked start events as a histogram with a count", async () => {
    await settledRunId();

    const text = await metricsText();

    expect(metricValue(text, "floor_events_claim_latency_seconds_count")).toBeGreaterThan(0);
  });

  it("reports a positive events queue depth once a run enqueues its start events", async () => {
    await workStarted(deps());

    const text = await metricsText();

    expect(metricValue(text, "floor_events_queue_depth")).toBeGreaterThan(0);
  });

  it("reports this replica as not holding the loop's lease before anything acquires it", async () => {
    const text = await metricsText();

    expect(metricValue(text, "floor_loop_holds_lease")).toBe(0);
  });
});
