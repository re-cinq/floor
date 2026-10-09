// Cost rollups (docs/assembly_run_storage.md, "Costs"): sums over station_run_records' llm_call rows, grouped in SQL, never in JavaScript.
import type { Pool, PoolClient } from "pg";
import { addCondition, addRepoCondition, type Queryable } from "./rows.js";

export interface CostsFilter {
  /** One assembly run: what one review cost, say. */
  runId?: string;
  repo?: string;
  lineId?: string;
  station?: string;
  since?: Date;
  until?: Date;
}

/** `model` is the model that did the work: the one an agent was given, and any it called on the side, each with what it read, wrote and cost. */
export type CostsGroupBy = "day" | "line" | "station" | "model" | "run";

export interface CostsRow {
  key: string | null;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  /** Grouped by model, a visit is counted under each model it called. */
  visits: number;
  visitsMissingCost: number;
  /** The models that counted tokens in these visits and had no price stated, so their part is not in the cost. */
  unpriced: string[];
}

export interface CostsStoreDeps {
  connection: Pool | PoolClient;
}

export class CostsStore {
  constructor(private readonly deps: CostsStoreDeps) {}

  async summary(filter: CostsFilter, groupBy: CostsGroupBy): Promise<CostsRow[]> {
    const { where, values } = whereClauseFor(filter);
    const { rows } = await this.deps.connection.query(summarySql(where, groupBy), values);

    return rows.map(toCostsRow);
  }

  /** What one run cost, or null when nothing was counted for it. */
  async ofRun(runId: string): Promise<CostsRow | null> {
    const rows = await this.summary({ runId }, "run");

    return rows.find(wasCounted) ?? null;
  }
}

function wasCounted(row: CostsRow): boolean {
  return row.costUsd > 0 || row.tokensIn > 0 || row.tokensOut > 0 || row.unpriced.length > 0;
}

// The `visits` CTE's own output columns, not the joined tables' aliases, which are out of scope by the time the outer select runs. A visit that names no models did its work with the one its definition gave it.
const GROUP_KEY_EXPR: Record<CostsGroupBy, string> = {
  day: "to_char(date_trunc('day', sr.opened_at), 'YYYY-MM-DD')",
  line: "ar.line_id",
  station: "d.id",
  model: "coalesce(lt.model, sr.input->'agentSettings'->>'model')",
  run: "ar.id::text",
};

function whereClauseFor(filter: CostsFilter): { where: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];

  addCondition(conditions, values, "ar.id = $%", filter.runId);
  addRepoCondition(conditions, values, "ar.repo", filter.repo);
  addCondition(conditions, values, "ar.line_id = $%", filter.lineId);
  addCondition(conditions, values, "d.id = $%", filter.station);
  addCondition(conditions, values, "sr.opened_at >= $%", filter.since);
  addCondition(conditions, values, "sr.opened_at < $%", filter.until);

  return { where: conditions.length > 0 ? `where ${conditions.join(" and ")}` : "", values };
}

// Tokens in are everything the model read: what it read from its cache, and what it wrote to it, are counted apart from the rest, and on a second turn the rest is a handful.
function tokensIn(counts: string): string {
  return `coalesce((${counts}->>'input_tokens')::numeric, 0)
        + coalesce((${counts}->>'cache_creation_input_tokens')::numeric, 0)
        + coalesce((${counts}->>'cache_read_input_tokens')::numeric, 0)`;
}

function tokensOut(counts: string): string {
  return `coalesce((${counts}->>'output_tokens')::numeric, 0)`;
}

/** One row a visit. */
const BY_VISIT = `
  totals as (
    select
      station_run_id,
      null::text as model,
      sum((body->>'costUsd')::numeric) filter (where body->>'costUsd' is not null) as cost_usd,
      sum(${tokensIn("body->'usage'")}) as tokens_in,
      sum(${tokensOut("body->'usage'")}) as tokens_out
    from station_run_records
    where kind = 'llm_call'
    group by station_run_id
  )
`;

// A record's models are taken one by one only when they account for its cost: where the record has a cost and no model has one, the cost is the record's, and splitting it would lose it.
const NAMES_MODELS = `jsonb_typeof(body->'models') = 'object' and body->'models' <> '{}'::jsonb
      and (body->>'costUsd' is null or jsonb_path_exists(body->'models', '$.*.cost_usd'))`;

/** One row a visit and a model it called. A record that names no models is one row, its model left for the visit's definition to name. */
const BY_MODEL = `
  totals as (
    select station_run_id, counted.key as model, (counted.value->>'cost_usd')::numeric as cost_usd,
      ${tokensIn("counted.value")} as tokens_in, ${tokensOut("counted.value")} as tokens_out
    from station_run_records, jsonb_each(body->'models') as counted
    where kind = 'llm_call' and ${NAMES_MODELS}
    union all
    select station_run_id, null::text, (body->>'costUsd')::numeric,
      ${tokensIn("body->'usage'")}, ${tokensOut("body->'usage'")}
    from station_run_records
    where kind = 'llm_call' and not coalesce(${NAMES_MODELS}, false)
  )
`;

const UNPRICED = `
  unpriced as (
    select station_run_id, named.model
    from station_run_records, jsonb_array_elements_text(body->'unpriced') as named(model)
    where kind = 'llm_call' and jsonb_typeof(body->'unpriced') = 'array'
  )
`;

/** A millionth of a dollar. An agent reports its cost as a fraction a machine cannot write exactly, and a sum of those ends in noise. */
const COST_DECIMALS = 6;

const MISSING_COST = "agent_definition_hash is not null and report is not null and cost_usd is null";

function summarySql(where: string, groupBy: CostsGroupBy): string {
  return `
    with ${groupBy === "model" ? BY_MODEL : BY_VISIT}, ${UNPRICED},
    visits as (
      select ${GROUP_KEY_EXPR[groupBy]} as key, sr.station_run_id, sr.agent_definition_hash, sr.report, lt.cost_usd, lt.tokens_in, lt.tokens_out
      from station_runs sr
      join assembly_runs ar on ar.id = sr.assembly_run_id
      left join definitions d on d.kind = 'station' and d.hash = sr.station_hash
      left join totals lt on lt.station_run_id = sr.station_run_id
      ${where}
    )
    select
      key,
      round(coalesce(sum(cost_usd), 0), ${COST_DECIMALS}) as cost_usd,
      coalesce(sum(tokens_in), 0) as tokens_in,
      coalesce(sum(tokens_out), 0) as tokens_out,
      count(distinct station_run_id) as visits,
      count(distinct station_run_id) filter (where ${MISSING_COST}) as visits_missing_cost,
      array(
        select distinct unpriced.model from unpriced join visits grouped using (station_run_id)
        where grouped.key is not distinct from visits.key order by 1
      ) as unpriced
    from visits
    group by key
    order by key
  `;
}

/** What one line's station spent on one model, for GET /metrics: the BY_MODEL rollup grouped three ways at once. A visit that named no model is attributed to the model in its run input's agentSettings. */
export interface CostSeriesRow {
  lineId: string;
  nodeId: string;
  model: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
}

const SERIES_SQL = `
  with ${BY_MODEL}
  select ar.line_id, sr.node_id, coalesce(lt.model, sr.input->'agentSettings'->>'model', '') as model,
    round(coalesce(sum(lt.cost_usd), 0), ${COST_DECIMALS}) as cost_usd,
    coalesce(sum(lt.tokens_in), 0) as tokens_in,
    coalesce(sum(lt.tokens_out), 0) as tokens_out
  from station_runs sr
  join assembly_runs ar on ar.id = sr.assembly_run_id
  join totals lt on lt.station_run_id = sr.station_run_id
  group by 1, 2, 3
  order by 1, 2, 3
`;

export async function costSeries(client: Queryable): Promise<CostSeriesRow[]> {
  const { rows } = await client.query<Record<string, string>>(SERIES_SQL);

  return rows.map((row) => ({
    lineId: row.line_id!,
    nodeId: row.node_id!,
    model: row.model!,
    costUsd: Number(row.cost_usd),
    tokensIn: Number(row.tokens_in),
    tokensOut: Number(row.tokens_out),
  }));
}

export interface MissingCostCount {
  lineId: string;
  count: number;
}

/** Agent visits that made model calls and stated no price for them, by line: the anomaly `internal.cost.missing` raises, as a number to watch. A visit with no llm_call record at all is not counted; it may not have called a model. */
export async function missingCostByLine(client: Queryable): Promise<MissingCostCount[]> {
  const { rows } = await client.query<Record<string, string>>(`
    with ${BY_VISIT}
    select ar.line_id, count(*)::text as count
    from station_runs sr
    join assembly_runs ar on ar.id = sr.assembly_run_id
    left join totals lt on lt.station_run_id = sr.station_run_id
    where sr.agent_definition_hash is not null and sr.report is not null and lt.cost_usd is null
      and exists (select 1 from station_run_records r where r.station_run_id = sr.station_run_id and r.kind = 'llm_call')
    group by ar.line_id order by ar.line_id
  `);

  return rows.map((row) => ({ lineId: row.line_id!, count: Number(row.count) }));
}

// snake_case mirrors Postgres's own column names verbatim, a third-party shape rather than ours to rename.
/* eslint-disable @typescript-eslint/naming-convention */
interface CostsRowRaw {
  key: string | null;
  cost_usd: string;
  tokens_in: string;
  tokens_out: string;
  visits: string;
  visits_missing_cost: string;
  unpriced: string[];
}
/* eslint-enable @typescript-eslint/naming-convention */

function toCostsRow(row: CostsRowRaw): CostsRow {
  return {
    key: row.key,
    costUsd: Number(row.cost_usd),
    tokensIn: Number(row.tokens_in),
    tokensOut: Number(row.tokens_out),
    visits: Number(row.visits),
    visitsMissingCost: Number(row.visits_missing_cost),
    unpriced: row.unpriced,
  };
}
