// GET /metrics (docs/api_sketch.md, "Metrics"): unauthenticated, for Prometheus to scrape. Every number comes from a fresh query against the shared tables, never a per-process counter — two api replicas would each only see their own traffic.
import type { Server } from "@hapi/hapi";
import type { CostSeriesRow, CountSeries, HistogramSeries, MetricLabels, OutcomeCount, RunMetrics } from "@floor/store";
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
  return [...runLines(snapshot.runs), ...visitLines(snapshot.runs), ...costLines(snapshot.runs), ...busLines(snapshot)].join("");
}

function runLines(runs: RunMetrics): string[] {
  return [
    gaugeLines("floor_runs_open", "Assembly runs with no finished_at yet.", runs.openRuns),
    settledRunLines(runs.settledByOutcome),
    countLines("floor_runs_started_total", "Assembly runs ever started, by line and repository, as of this scrape.", runs.runsStarted),
    countLines("floor_runs_settled_by_line_total", "Assembly runs that have finished, by line and outcome, as of this scrape.", runs.runsSettledByLine),
    histogramLines("floor_run_duration_seconds", "Seconds from a run's start to its settling, by line and outcome.", runs.runDurations),
  ];
}

function visitLines(runs: RunMetrics): string[] {
  const finished = runs.visitDurations.map((series) => ({ labels: series.labels, count: series.count }));

  return [
    gaugeLines("floor_visits_open", "Station runs with no report yet.", runs.openVisits),
    gaugeLines("floor_visits_overdue", "Open station runs past their deadline.", runs.overdueVisits),
    countLines("floor_visits_total", "Finished station runs, by line, station and outcome, as of this scrape.", finished),
    histogramLines("floor_visit_duration_seconds", "Seconds a visit stayed open, by line, station and outcome.", runs.visitDurations),
    countLines("floor_visit_retries_total", "Station runs that revisited their node (iteration above 1), by line and station.", runs.visitRetries),
  ];
}

function costLines(runs: RunMetrics): string[] {
  const tokens = [
    ...runs.costs.map((row) => ({ labels: { ...costLabels(row), kind: "in" }, value: row.tokensIn })),
    ...runs.costs.map((row) => ({ labels: { ...costLabels(row), kind: "out" }, value: row.tokensOut })),
  ];
  const missing = runs.missingCost.map((row) => ({ labels: { line_id: row.lineId }, value: row.count }));

  return [
    valueLines("floor_cost_usd_total", "Cost in USD of every llm_call record, by line, station and model, as of this scrape.", runs.costs.map((row) => ({ labels: costLabels(row), value: row.costUsd }))),
    valueLines("floor_tokens_total", "Tokens of every llm_call record, by line, station, model and direction, as of this scrape.", tokens),
    valueLines("floor_visits_missing_cost", "Agent visits that reported and stated no price, by line.", missing),
  ];
}

function costLabels(row: CostSeriesRow): MetricLabels {
  return { line_id: row.lineId, node_id: row.nodeId, model: row.model };
}

function busLines(snapshot: MetricsSnapshot): string[] {
  return [
    gaugeLines("floor_events_queue_depth", "Events not yet acked, dead, or dropped.", snapshot.eventsQueueDepth),
    gaugeLines("floor_events_dead_total", "Events that gave up rather than being retried.", snapshot.eventsDeadTotal),
    histogramLines("floor_events_claim_latency_seconds", "Seconds an acked event waited from being due to being claimed.", snapshot.runs.claimLatencies),
    gaugeLines("floor_loop_holds_lease", "Whether this replica runs the floor's loop (1) or not (0).", snapshot.holdsLease ? 1 : 0),
  ];
}

function gaugeLines(name: string, help: string, value: number): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${value}\n`;
}

// A gauge snapshot of a total, not a monotonic counter: computed fresh from assembly_runs on every scrape, so it can drop as well as rise (docs/api_sketch.md, "Metrics").
function settledRunLines(counts: OutcomeCount[]): string {
  const samples = counts.map((count) => ({ labels: { outcome: count.outcome }, value: count.count }));

  return valueLines("floor_runs_settled_total", "Assembly runs that have finished, by outcome, as of this scrape.", samples);
}

function countLines(name: string, help: string, series: CountSeries[]): string {
  return valueLines(name, help, series.map((entry) => ({ labels: entry.labels, value: entry.count })));
}

/** A labelled gauge-of-total: every sample is a fresh count or sum, declared as a gauge because the rows behind it can be pruned. */
function valueLines(name: string, help: string, samples: { labels: MetricLabels; value: number }[]): string {
  const lines = samples.map((sample) => `${name}${labelText(sample.labels)} ${sample.value}\n`);

  return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${lines.join("")}`;
}

/** Prometheus's own name for a histogram bucket's upper bound. */
const BOUND_LABEL = "le";

/** Cumulative buckets, then `+Inf`, `_sum` and `_count`, per label tuple: Prometheus's own histogram shape, computed by the query that counted the rows. */
function histogramLines(name: string, help: string, series: HistogramSeries[]): string {
  const lines = series.flatMap((entry) => [
    ...entry.buckets.map((bucket) => `${name}_bucket${labelText({ ...entry.labels, [BOUND_LABEL]: String(bucket.upTo) })} ${bucket.count}\n`),
    `${name}_bucket${labelText({ ...entry.labels, [BOUND_LABEL]: "+Inf" })} ${entry.count}\n`,
    `${name}_sum${labelText(entry.labels)} ${entry.sum}\n`,
    `${name}_count${labelText(entry.labels)} ${entry.count}\n`,
  ]);

  return `# HELP ${name} ${help}\n# TYPE ${name} histogram\n${lines.join("")}`;
}

function labelText(labels: MetricLabels): string {
  const pairs = Object.entries(labels).map(([key, value]) => `${key}="${escapedLabel(value)}"`);

  return pairs.length ? `{${pairs.join(",")}}` : "";
}

function escapedLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
