// The numbers behind GET /metrics (docs/api_sketch.md, "Metrics"): every one a fresh query on every scrape, never a per-process counter. A histogram is `count(*) where seconds <= bound` per bucket, cumulative for as long as the rows stay.

import { costSeries, missingCostByLine, type CostSeriesRow, type MissingCostCount } from "./costs.js";
import type { Queryable } from "./rows.js";

export type MetricLabels = Record<string, string>;

export interface HistogramBucket {
  upTo: number;
  count: number;
}

/** One labelled histogram: cumulative bucket counts, the sum of what was measured and how many were measured. */
export interface HistogramSeries {
  labels: MetricLabels;
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

export interface CountSeries {
  labels: MetricLabels;
  count: number;
}

export interface OutcomeCount {
  outcome: string;
  count: number;
}

export interface RunMetrics {
  openRuns: number;
  settledByOutcome: OutcomeCount[];
  openVisits: number;
  overdueVisits: number;
  runsStarted: CountSeries[];
  runsSettledByLine: CountSeries[];
  runDurations: HistogramSeries[];
  visitDurations: HistogramSeries[];
  visitRetries: CountSeries[];
  claimLatencies: HistogramSeries[];
  costs: CostSeriesRow[];
  missingCost: MissingCostCount[];
}

/** Bucket bounds that double from `first`: a minute to about two hours for a run, ten seconds to about forty minutes for a visit. */
export function doublingBounds(first: number, steps: number): number[] {
  return [...Array(steps).keys()].map((step) => first * 2 ** step);
}

const MINUTE_SECONDS = 60;
const RUN_BUCKETS = 8;
const SHORTEST_VISIT_SECONDS = 10;
const VISIT_BUCKETS = 9;
const QUICKEST_CLAIM_SECONDS = 0.1;
const CLAIM_BUCKETS = 10;

export const RUN_DURATION_BOUNDS = doublingBounds(MINUTE_SECONDS, RUN_BUCKETS);
export const VISIT_DURATION_BOUNDS = doublingBounds(SHORTEST_VISIT_SECONDS, VISIT_BUCKETS);
export const CLAIM_LATENCY_BOUNDS = doublingBounds(QUICKEST_CLAIM_SECONDS, CLAIM_BUCKETS);

export async function runMetricsSnapshot(client: Queryable, now: Date): Promise<RunMetrics> {
  const [counts, series] = await Promise.all([countSnapshot(client, now), seriesSnapshot(client)]);

  return { ...counts, ...series };
}

type CountSnapshot = Pick<RunMetrics, "openRuns" | "settledByOutcome" | "openVisits" | "overdueVisits">;

async function countSnapshot(client: Queryable, now: Date): Promise<CountSnapshot> {
  const [openRuns, settledByOutcome, openVisits, overdueVisits] = await Promise.all([
    countOf(client, `select count(*) as count from assembly_runs where finished_at is null`),
    settledRunCounts(client),
    countOf(client, `select count(*) as count from station_runs where report is null`),
    countOf(client, `select count(*) as count from station_runs where report is null and deadline < $1`, [now]),
  ]);

  return { openRuns, settledByOutcome, openVisits, overdueVisits };
}

type SeriesSnapshot = Omit<RunMetrics, keyof CountSnapshot>;

async function seriesSnapshot(client: Queryable): Promise<SeriesSnapshot> {
  const [runsStarted, runsSettledByLine, runDurations, visitDurations, visitRetries, claimLatencies, costs, missingCost] = await Promise.all([
    countSeries(client, `select line_id, repo, count(*)::text as count from assembly_runs group by line_id, repo order by line_id, repo`, ["line_id", "repo"]),
    countSeries(client, `select line_id, outcome, count(*)::text as count from assembly_runs where outcome is not null group by line_id, outcome order by line_id, outcome`, ["line_id", "outcome"]),
    histogram(client, SETTLED_RUNS, ["line_id", "outcome"], RUN_DURATION_BOUNDS),
    histogram(client, FINISHED_VISITS, ["line_id", "node_id", "outcome"], VISIT_DURATION_BOUNDS),
    countSeries(client, REVISITS, ["line_id", "node_id"]),
    histogram(client, ACKED_EVENTS, [], CLAIM_LATENCY_BOUNDS),
    costSeries(client),
    missingCostByLine(client),
  ]);

  return { runsStarted, runsSettledByLine, runDurations, visitDurations, visitRetries, claimLatencies, costs, missingCost };
}

const SETTLED_RUNS = `select line_id, outcome, extract(epoch from finished_at - created_at)::float8 as seconds
  from assembly_runs where finished_at is not null and outcome is not null`;

/** A finished visit's `count` is the number of visits, so the same rows serve `floor_visits_total`. */
const FINISHED_VISITS = `select ar.line_id, sr.node_id, sr.outcome, extract(epoch from sr.finished_at - sr.opened_at)::float8 as seconds
  from station_runs sr join assembly_runs ar on ar.id = sr.assembly_run_id
  where sr.finished_at is not null and sr.outcome is not null`;

/** Visits that were a revisit of their node: the loop went round again. */
const REVISITS = `select ar.line_id, sr.node_id, count(*)::text as count
  from station_runs sr join assembly_runs ar on ar.id = sr.assembly_run_id
  where sr.iteration > 1 group by ar.line_id, sr.node_id order by ar.line_id, sr.node_id`;

const ACKED_EVENTS = `select extract(epoch from claimed_at - not_before)::float8 as seconds
  from events where acked_at is not null and claimed_at is not null`;

async function settledRunCounts(client: Queryable): Promise<OutcomeCount[]> {
  const { rows } = await client.query<{ outcome: string; count: string }>(
    `select outcome, count(*) as count from assembly_runs where outcome is not null group by outcome`,
  );

  return rows.map((row) => ({ outcome: row.outcome, count: Number(row.count) }));
}

async function countOf(client: Queryable, countSql: string, values: unknown[] = []): Promise<number> {
  const { rows } = await client.query<{ count: string }>(countSql, values);

  return Number(rows[0]!.count);
}

type CountRow = Record<string, string> & { count: string };

async function countSeries(client: Queryable, countSql: string, labelNames: string[]): Promise<CountSeries[]> {
  const { rows } = await client.query<CountRow>(countSql);

  return rows.map((row) => ({ labels: labelsOf(row, labelNames), count: Number(row.count) }));
}

export interface HistogramRow extends Record<string, string | number> {
  bound: number;
  count: string;
  sum: number;
  total: string;
}

// One row per label tuple and bucket; `sum` and `total` repeat on every row of a tuple and are read once.
async function histogram(client: Queryable, sample: string, labelNames: string[], bounds: number[]): Promise<HistogramSeries[]> {
  const labels = labelNames.length ? `${labelNames.join(", ")},` : "";
  const grouping = labelNames.length ? `${labelNames.join(", ")}, bound` : "bound";
  const { rows } = await client.query<HistogramRow>(
    `with sample as (${sample})
     select ${labels} bound, count(*) filter (where seconds <= bound)::text as count, sum(seconds)::float8 as sum, count(*)::text as total
       from sample cross join unnest($1::float8[]) as bound
      group by ${grouping} order by ${grouping}`,
    [bounds],
  );

  return foldHistogramRows(rows, labelNames);
}

/** Folds the bucket rows of one query into a series per label tuple, in row order. */
export function foldHistogramRows(rows: HistogramRow[], labelNames: string[]): HistogramSeries[] {
  const series = new Map<string, HistogramSeries>();

  for (const row of rows) {
    const labels = labelsOf(row, labelNames);
    const key = JSON.stringify(labels);
    const current = series.get(key) ?? { labels, buckets: [], sum: row.sum, count: Number(row.total) };

    current.buckets.push({ upTo: Number(row.bound), count: Number(row.count) });
    series.set(key, current);
  }

  return [...series.values()];
}

function labelsOf(row: Record<string, unknown>, labelNames: string[]): MetricLabels {
  return Object.fromEntries(labelNames.map((name) => [name, String(row[name])]));
}
