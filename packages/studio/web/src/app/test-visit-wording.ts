import type { TestReadResult } from "@/socket/studio-connection";

export function outcomeWording(visit: { report: { outcome: string } | null; kind: string }, runStatus?: TestReadResult["status"]): string {
  if (visit.report) return visit.report.outcome;
  if (runStatus === "stopped") return "stopped";

  return visit.kind === "agent" ? "running" : "waiting";
}

export function costWording(costUsd: number | undefined): string {
  return costUsd === undefined ? "not stated" : `$${costUsd}`;
}

const MS_PER_SECOND = 1000;

export function timeWording(visit: { agentDurationMs?: number }): string {
  return visit.agentDurationMs === undefined ? "" : `${(visit.agentDurationMs / MS_PER_SECOND).toFixed(1)} s`;
}

interface Measured {
  agentDurationMs?: number;
  costUsd?: number;
}

const MICRO_DOLLARS_PER_DOLLAR = 1_000_000;

export function totalOf(visits: readonly Measured[]): Measured {
  const durations = visits.flatMap((visit) => visit.agentDurationMs ?? []);
  const costs = visits.flatMap((visit) => visit.costUsd ?? []);

  return {
    agentDurationMs: durations.length === 0 ? undefined : sum(durations),
    costUsd: costs.length === 0 ? undefined : Math.round(sum(costs) * MICRO_DOLLARS_PER_DOLLAR) / MICRO_DOLLARS_PER_DOLLAR,
  };
}

function sum(numbers: number[]): number {
  return numbers.reduce((total, value) => total + value, 0);
}
