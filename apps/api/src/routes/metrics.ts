// GET /metrics (docs/api_sketch.md, "Metrics"): unauthenticated, for Google Managed Prometheus to scrape. Every number comes from a fresh query against the shared tables, never a per-process counter — two api replicas would each only see their own traffic.
import type { Server } from "@hapi/hapi";
import type { OutcomeCount, RunMetrics } from "@floor/store";
import type { Deps } from "../deps.js";

const METRICS_CONTENT_TYPE = "text/plain; version=0.0.4";

export interface MetricsReadiness {
  holdsLease: () => boolean;
}

export interface MetricsSnapshot {
  runs: RunMetrics;
  eventsQueueDepth: number;
  eventsDeadTotal: number;
  holdsLease: boolean;
}

export function registerMetricsRoutes(server: Server, deps: Deps, readiness: MetricsReadiness): void {
  server.route({
    method: "GET",
    path: "/metrics",
    options: { auth: false },
    handler: async (request, toolkit) => {
      const snapshot = await metricsSnapshot(deps, readiness);

      return toolkit.response(renderMetrics(snapshot)).type(METRICS_CONTENT_TYPE);
    },
  });
}

async function metricsSnapshot(deps: Deps, readiness: MetricsReadiness): Promise<MetricsSnapshot> {
  const [runs, eventsQueueDepth, eventsDeadTotal] = await Promise.all([
    deps.runs.metrics(deps.now()),
    deps.events.claimableCount(),
    deps.events.deadCount(),
  ]);

  return { runs, eventsQueueDepth, eventsDeadTotal, holdsLease: readiness.holdsLease() };
}

/** Prometheus text exposition format (`# HELP`, `# TYPE`, then `name{labels} value`): no in-process shape of our own to invent. */
export function renderMetrics(snapshot: MetricsSnapshot): string {
  return [
    gaugeLines("floor_runs_open", "Assembly runs with no finished_at yet.", snapshot.runs.openRuns),
    settledRunLines(snapshot.runs.settledByOutcome),
    gaugeLines("floor_visits_open", "Station runs with no report yet.", snapshot.runs.openVisits),
    gaugeLines("floor_visits_overdue", "Open station runs past their deadline.", snapshot.runs.overdueVisits),
    gaugeLines("floor_events_queue_depth", "Events not yet acked, dead, or dropped.", snapshot.eventsQueueDepth),
    gaugeLines("floor_events_dead_total", "Events that gave up rather than being retried.", snapshot.eventsDeadTotal),
    gaugeLines("floor_loop_holds_lease", "Whether this replica runs the floor's loop (1) or not (0).", snapshot.holdsLease ? 1 : 0),
  ].join("");
}

function gaugeLines(name: string, help: string, value: number): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${value}\n`;
}

// A gauge snapshot of a total, not a monotonic counter: computed fresh from assembly_runs on every scrape, so it can drop as well as rise (docs/api_sketch.md, "Metrics").
function settledRunLines(counts: OutcomeCount[]): string {
  const help = "# HELP floor_runs_settled_total Assembly runs that have finished, by outcome, as of this scrape.\n";
  const type = "# TYPE floor_runs_settled_total gauge\n";
  const samples = counts.map((count) => `floor_runs_settled_total{outcome="${escapedLabel(count.outcome)}"} ${count.count}\n`);

  return help + type + samples.join("");
}

function escapedLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
