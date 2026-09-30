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
