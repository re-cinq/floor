import type { TestReadResult } from "@/socket/studio-connection";

const WAITING_LABEL = "Waiting for you";

export function overlayOf(visits: TestReadResult["visits"], runStatus: TestReadResult["status"] | undefined) {
  return {
    visits: visits.map((visit) => ({ nodeId: visit.nodeId, iteration: visit.iteration, outcome: visit.report?.outcome, open: visit.report === null && runStatus !== "stopped" })),
  };
}

export function waitingOf(state: TestReadResult | undefined): Record<string, string> {
  const waitingVisits = (state?.visits ?? []).filter((visit) => (state?.actions[visit.id] ?? []).length > 0);

  return Object.fromEntries(waitingVisits.map((visit) => [visit.nodeId, WAITING_LABEL]));
}
