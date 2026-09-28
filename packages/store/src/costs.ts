// Cost rollups (docs/assembly_run_storage.md, "Costs"): sums over station_run_records' llm_call rows, grouped in SQL, never in JavaScript.
import type { Pool, PoolClient } from "pg";
import { addCondition } from "./rows.js";

export interface CostsFilter {
  repo?: string;
  lineId?: string;
  station?: string;
  since?: Date;
  until?: Date;
}

export type CostsGroupBy = "day" | "line" | "station" | "model";

export interface CostsRow {
  key: string | null;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  visits: number;
  visitsMissingCost: number;
}

export interface CostsStoreDeps {
  connection: Pool | PoolClient;
}

export class CostsStore {
  constructor(private readonly deps: CostsStoreDeps) {}

  async summary(filter: CostsFilter, groupBy: CostsGroupBy): Promise<CostsRow[]> {
    const { where, values } = whereClauseFor(filter);
    const text = summarySql(where, GROUP_KEY_EXPR[groupBy]);
    const { rows } = await this.deps.connection.query(text, values);

    return rows.map(toCostsRow);
  }
}

// The `visits` CTE's own output columns, not the joined tables' aliases, which are out of scope by the time the outer select runs.
const GROUP_KEY_EXPR: Record<CostsGroupBy, string> = {
  day: "to_char(date_trunc('day', opened_at), 'YYYY-MM-DD')",
  line: "line_id",
  station: "station_id",
  model: "input->'agentSettings'->>'model'",
};

function whereClauseFor(filter: CostsFilter): { where: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];

  addCondition(conditions, values, "ar.repo = $%", filter.repo);
  addCondition(conditions, values, "ar.line_id = $%", filter.lineId);
  addCondition(conditions, values, "d.id = $%", filter.station);
  addCondition(conditions, values, "sr.opened_at >= $%", filter.since);
  addCondition(conditions, values, "sr.opened_at < $%", filter.until);

  return { where: conditions.length > 0 ? `where ${conditions.join(" and ")}` : "", values };
}

const LLM_TOTALS_CTE = `
  llm_totals as (
    select
      station_run_id,
      sum((body->>'costUsd')::numeric) filter (where body->>'costUsd' is not null) as cost_usd,
      sum(coalesce((body->'usage'->>'input_tokens')::numeric, 0)) as tokens_in,
      sum(coalesce((body->'usage'->>'output_tokens')::numeric, 0)) as tokens_out,
      bool_or(body->>'costUsd' is not null) as has_cost
    from station_run_records
    where kind = 'llm_call'
    group by station_run_id
  )
`;

const VISITS_COLUMNS = `
  sr.opened_at, sr.agent_definition_hash, sr.report, sr.input,
  ar.repo, ar.line_id, d.id as station_id,
  lt.cost_usd, lt.tokens_in, lt.tokens_out, lt.has_cost
`;

const VISITS_JOIN = `
  from station_runs sr
  join assembly_runs ar on ar.id = sr.assembly_run_id
  left join definitions d on d.kind = 'station' and d.hash = sr.station_hash
  left join llm_totals lt on lt.station_run_id = sr.station_run_id
`;

const MISSING_COST_FILTER = "agent_definition_hash is not null and report is not null and not coalesce(has_cost, false)";

function summarySql(where: string, key: string): string {
  return `
    with ${LLM_TOTALS_CTE},
    visits as (
      select ${VISITS_COLUMNS}
      ${VISITS_JOIN}
      ${where}
    )
    select
      ${key} as key,
      coalesce(sum(cost_usd), 0) as cost_usd,
      coalesce(sum(tokens_in), 0) as tokens_in,
      coalesce(sum(tokens_out), 0) as tokens_out,
      count(*) as visits,
      count(*) filter (where ${MISSING_COST_FILTER}) as visits_missing_cost
    from visits
    group by key
    order by key
  `;
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
  };
}
