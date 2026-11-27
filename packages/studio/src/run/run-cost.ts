// Reads what an agent run cost and how long it took from the final "result" line of its stream-json transcript.
import { lastResultLine } from "./result-line.js";
import type { RunLine } from "./run-process.js";

export interface RunCost {
  costUsd?: number;
  durationMs?: number;
}

export function runCost(lines: RunLine[]): RunCost {
  const stated = lastResultLine(lines);
  const costUsd = statedAmount(stated?.total_cost_usd);
  const durationMs = statedAmount(stated?.duration_ms);
  const cost: RunCost = {};

  if (costUsd !== undefined) cost.costUsd = costUsd;
  if (durationMs !== undefined) cost.durationMs = durationMs;

  return cost;
}

function statedAmount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
